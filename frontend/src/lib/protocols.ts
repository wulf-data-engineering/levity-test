import { compress, uncompress } from 'snappyjs';
import type { BinaryWriter } from '@bufbuild/protobuf/wire';

// The protocol fetch methods use this type to describe the encode/decode functions for a message type.
type ProtoType<T> = {
	encode?: (msg: T) => BinaryWriter;
	decode?: (bytes: Uint8Array) => T;
	toJSON?: (msg: T) => unknown;
	fromJSON?: (obj: unknown) => T;
};

// All protocol fetch methods support the fetch options and the optional json flag.
type Options = RequestInit & {
	asJson?: boolean;
};

// Larger protocol buffer payloads are compressed using snappy.
const compressionThreshold = 128;

/**
 * Sends a protocol request and expects a protocol response.
 *
 * Usage:
 * ```typescript
 * await protocolRequest('/api/load-something', { id: 'bar' }, Request, Response);
 * ```
 *
 * @param url the API endpoint URL
 * @param requestMessage the request data
 * @param requestProto the request protocol (protobuf type) matching the message
 * @param responseProto the expected response protocol (protobuf type)
 * @param options similar to `fetch(...)` options, with optional `asJson` flag
 */
export async function protocolRequest<Req, Res>(
	url: string,
	requestMessage: Req,
	requestProto: ProtoType<Req>,
	responseProto: ProtoType<Res>,
	options: Options = {}
): Promise<Res> {
	return (await protocolImpl(url, requestMessage, requestProto, responseProto, options)) as Res;
}

/**
 * Loads a protocol resource without sending any request message.
 *
 * Usage:
 * ```typescript
 * await protocolLoad('/api/some-data', SomeData);
 * ```
 *
 * @param url the API endpoint URL
 * @param responseProto the expected response protocol (protobuf type)
 * @param options similar to `fetch(...)` options, with optional `asJson` flag
 */
export async function protocolLoad<Res>(
	url: string,
	responseProto: ProtoType<Res>,
	options: Options = {}
): Promise<Res> {
	return (await protocolImpl(url, undefined, undefined, responseProto, options)) as Res;
}

/**
 * Sends a protocol command without expecting any response message.
 *
 * Usage:
 * ```typescript
 * await protocolCommand('/api/delete-something', { id: 'bar' }, DeleteCommand, { method: 'DELETE' });
 * ```
 *
 * @param url the API endpoint URL
 * @param requestMessage the request data
 * @param requestProto the request protocol (protobuf type) matching the message
 * @param options similar to `fetch(...)` options, with optional `asJson` flag
 */
export async function protocolCommand<Req>(
	url: string,
	requestMessage: Req,
	requestProto: ProtoType<Req>,
	options: Options = {}
): Promise<void> {
	await protocolImpl(url, requestMessage, requestProto, undefined, options);
}

async function protocolImpl<Req = undefined, Res = undefined>(
	url: string,
	requestMessage: Req | undefined,
	requestProto: ProtoType<Req> | undefined,
	responseProto: ProtoType<Res> | undefined,
	options: Options = {}
): Promise<Res | undefined> {
	const { asJson = false } = options;

	let body: BodyInit | undefined;
	let compressed = false;

	if (requestMessage && requestProto) {
		if (asJson) {
			body = JSON.stringify(requestProto.toJSON!(requestMessage));
		} else {
			const binary = requestProto.encode!(requestMessage).finish();
			if (binary.byteLength > compressionThreshold) {
				body = compress(binary);
				compressed = true;
			} else {
				body = binary;
			}
		}
	}

	const contentType = asJson ? 'application/json' : 'application/x-protobuf';

	const init: RequestInit = options;
	if (!init.method) {
		init.method = body ? 'POST' : 'GET';
	}
	init.headers = {
		...init.headers,
		accept: contentType,
		...(body ? { 'content-type': contentType } : {}),
		...(compressed ? { 'content-encoding': 'snappy' } : {})
	};

	init.body = body;

	const res = await fetch(url, init);

	if (responseProto) {
		const resContentType = res.headers.get('content-type') ?? '';
		if (resContentType.includes('application/json')) {
			const text = await res.text();
			return responseProto.fromJSON!(JSON.parse(text));
		} else {
			let bytes = await res.bytes();
			const resContentEncoding = res.headers.get('content-encoding') ?? '';
			if (resContentEncoding === 'snappy') {
				bytes = uncompress(bytes);
			}
			return responseProto.decode!(bytes);
		}
	}
}
