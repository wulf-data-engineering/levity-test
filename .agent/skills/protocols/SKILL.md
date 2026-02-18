---
name: Protocol Development
description: Add or change protocols between frontend and backend
---

# Change Protocols

## Concepts

The project uses **Protocol Buffers** to define the API between frontend and backend.

They are transported using HTTP due to API Gateway not supporting gRPC.

Content negotiation is used to select between JSON and PB representations.

In local development, as JSON representation is used for easier debugging.

## Development

Read the existing `protocols/`

Change or add new `.proto` files as needed.
