import { describe, expect, it, vi } from 'vitest';
import { protocolCommand, protocolLoad, protocolRequest } from '$lib/protocols';
import { compress, uncompress } from 'snappyjs';
import { BinaryReader, BinaryWriter } from '@bufbuild/protobuf/wire';

describe('protocols', () => {
	it('sends JSON commands', async () => {
		const commandMessage = { value: 'ping' };

		let sentContentType: string | null = null;
		let sentBody: BodyInit | null | undefined = undefined;

		global.fetch = vi.fn((_url: string | URL, init: RequestInit | undefined) => {
			const requestHeaders = new Headers(init!.headers!);
			sentContentType = requestHeaders.get('content-type');
			sentBody = init?.body;
			Promise.resolve({
				ok: true
			});
		}) as never;

		await protocolCommand<ProtoMock>('/', commandMessage, ProtoMock, { asJson: true });

		expect(sentContentType).toBe('application/json');
		expect(sentBody).toBe(JSON.stringify(commandMessage));
	});

	it('sends JSON requests', async () => {
		const requestMessage = { value: 'ping' };
		const responseMessage = { value: 'pong' };

		let sentContentType: string | null = null;
		let sentAccept: string | null = null;
		let sentBody: BodyInit | null | undefined = undefined;

		global.fetch = vi.fn((_url: string | URL, init: RequestInit | undefined) => {
			const requestHeaders = new Headers(init!.headers!);
			sentContentType = requestHeaders.get('content-type');
			sentAccept = requestHeaders.get('accept');
			sentBody = init?.body;

			const responseHeaders = new Headers();
			responseHeaders.set('content-type', 'application/json');
			return Promise.resolve({
				ok: true,
				headers: responseHeaders,
				text: () => Promise.resolve(JSON.stringify(responseMessage))
			});
		}) as never;

		const response = await protocolRequest<ProtoMock, ProtoMock>(
			'/',
			requestMessage,
			ProtoMock,
			ProtoMock,
			{ asJson: true }
		);

		expect(sentContentType).toBe('application/json');
		expect(sentAccept).toBe('application/json');
		expect(sentBody).toBe(JSON.stringify(requestMessage));

		expect(response).toEqual(responseMessage);
	});

	it('loads JSON', async () => {
		const responseMessage = { value: 'pong' };

		let sentAccept: string | null = null;
		let sentBody: BodyInit | null | undefined = undefined;

		global.fetch = vi.fn((_url: string | URL, init: RequestInit | undefined) => {
			const requestHeaders = new Headers(init!.headers!);
			sentAccept = requestHeaders.get('accept');
			sentBody = init?.body;

			const responseHeaders = new Headers();
			responseHeaders.set('content-type', 'application/json');
			return Promise.resolve({
				ok: true,
				headers: responseHeaders,
				text: () => Promise.resolve(JSON.stringify(responseMessage))
			});
		}) as never;

		const response = await protocolLoad<ProtoMock>('/', ProtoMock, { asJson: true });

		expect(sentAccept).toBe('application/json');
		expect(sentBody).toBeUndefined();

		expect(response).toEqual(responseMessage);
	});

	it('sends Protocol Buffers commands', async () => {
		const commandMessage = { value: 'ping' };

		let sentContentType: string | null = null;
		let sentBody: BodyInit | null | undefined = undefined;

		global.fetch = vi.fn((_url: string | URL, init: RequestInit | undefined) => {
			const requestHeaders = new Headers(init!.headers!);
			sentContentType = requestHeaders.get('content-type');
			sentBody = init?.body;
			Promise.resolve({
				ok: true
			});
		}) as never;

		await protocolCommand<ProtoMock>('/', commandMessage, ProtoMock);

		expect(sentContentType).toBe('application/x-protobuf');
		expect(ProtoMock.decode(sentBody! as Uint8Array)).toEqual(commandMessage);
	});

	it('sends large Protocol Buffers commands compressed', async () => {
		const commandMessage = { value: 'ping'.repeat(100) };

		let sentContentType: string | null = null;
		let sentContentEncoding: string | null = null;
		let sentBody: BodyInit | null | undefined = undefined;

		global.fetch = vi.fn((_url: string | URL, init: RequestInit | undefined) => {
			const requestHeaders = new Headers(init!.headers!);
			sentContentType = requestHeaders.get('content-type');
			sentContentEncoding = requestHeaders.get('content-encoding');
			sentBody = init?.body;
			Promise.resolve({
				ok: true
			});
		}) as never;

		await protocolCommand<ProtoMock>('/', commandMessage, ProtoMock);

		expect(sentContentType).toBe('application/x-protobuf');
		expect(sentContentEncoding).toBe('snappy');

		expect(ProtoMock.decode(uncompress(sentBody! as Uint8Array))).toEqual(commandMessage);
	});

	it('sends Protocol Buffers requests', async () => {
		const requestMessage = { value: 'ping' };
		const responseMessage = { value: 'pong' };

		let sentContentType: string | null = null;
		let sentAccept: string | null = null;
		let sentBody: BodyInit | null | undefined = undefined;

		global.fetch = vi.fn((_url: string | URL, init: RequestInit | undefined) => {
			const requestHeaders = new Headers(init!.headers!);
			sentContentType = requestHeaders.get('content-type');
			sentAccept = requestHeaders.get('accept');
			sentBody = init?.body;

			const responseHeaders = new Headers();
			responseHeaders.set('content-type', 'application/x-protobuf');
			return Promise.resolve({
				ok: true,
				headers: responseHeaders,
				bytes: () => Promise.resolve(ProtoMock.encode(responseMessage).finish())
			});
		}) as never;

		const response = await protocolRequest<ProtoMock, ProtoMock>(
			'/',
			requestMessage,
			ProtoMock,
			ProtoMock
		);

		expect(sentContentType).toBe('application/x-protobuf');
		expect(sentAccept).toBe('application/x-protobuf');
		expect(ProtoMock.decode(sentBody! as Uint8Array)).toEqual(requestMessage);

		expect(response).toEqual(responseMessage);
	});

	it('loads Protocol Buffers', async () => {
		const responseMessage = { value: 'pong' };

		let sentAccept: string | null = null;

		global.fetch = vi.fn((_url: string | URL, init: RequestInit | undefined) => {
			const requestHeaders = new Headers(init!.headers!);
			sentAccept = requestHeaders.get('accept');

			const responseHeaders = new Headers();
			responseHeaders.set('content-type', 'application/x-protobuf');
			return Promise.resolve({
				ok: true,
				headers: responseHeaders,
				bytes: () => Promise.resolve(ProtoMock.encode(responseMessage).finish())
			});
		}) as never;

		const response = await protocolLoad<ProtoMock>('/', ProtoMock);

		expect(sentAccept).toBe('application/x-protobuf');
		expect(response).toEqual(responseMessage);
	});

	it('loads snappy compressed Protocol Buffers', async () => {
		const responseMessage = { value: 'pong' };

		let sentAccept: string | null = null;

		global.fetch = vi.fn((_url: string | URL, init: RequestInit | undefined) => {
			const requestHeaders = new Headers(init!.headers!);
			sentAccept = requestHeaders.get('accept');

			const responseHeaders = new Headers();
			responseHeaders.set('content-type', 'application/x-protobuf');
			responseHeaders.set('content-encoding', 'snappy');
			return Promise.resolve({
				ok: true,
				headers: responseHeaders,
				bytes: () => Promise.resolve(compress(ProtoMock.encode(responseMessage).finish()))
			});
		}) as never;

		const response = await protocolLoad<ProtoMock>('/', ProtoMock);

		expect(sentAccept).toBe('application/x-protobuf');
		expect(response).toEqual(responseMessage);
	});
});

type ProtoMock = {
	value: string;
};

// uses JSON for binary representation, too
const ProtoMock = {
	encode: (msg: ProtoMock) => {
		const binaryWriter = new BinaryWriter();
		binaryWriter.string(JSON.stringify(msg));
		return binaryWriter;
	},
	decode: (bytes: Uint8Array) => {
		const binaryReader = new BinaryReader(bytes);
		return JSON.parse(binaryReader.string()) as ProtoMock;
	},
	toJSON: (msg: ProtoMock) => msg,
	fromJSON: (obj: unknown) => obj as ProtoMock
};
