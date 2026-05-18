# Proxy Surface

This context defines the boundary language for server-side routes that relay console intent to Floci and return normalized responses to the UI.

## Language

**Proxy Surface**:
The server boundary that forwards console traffic to Floci-compatible endpoints.
_Avoid_: integration layer, backend

**Upstream Runtime**:
The Floci process that receives proxied calls.
_Avoid_: server, API

**Proxy Route**:
A server endpoint that relays method, path, query, headers, and body to the **Upstream Runtime**.
_Avoid_: passthrough, tunnel

**Control Route**:
A server endpoint that exposes UI control metadata rather than raw service operations.
_Avoid_: helper endpoint, utility

**Manifest**:
A structured payload describing application version information for update checks.
_Avoid_: config, blob

**Upstream Error**:
A failure response produced by the **Upstream Runtime** during proxied operations.
_Avoid_: internal error, console error

**Mapped Error**:
A normalized failure response shaped by a **Control Route** for operator clarity.
_Avoid_: translated error, wrapped error

## Relationships

- The **Proxy Surface** includes many **Proxy Routes** and **Control Routes**
- A **Proxy Route** forwards console intent to one **Upstream Runtime**
- A **Control Route** returns metadata such as a **Manifest** to the console
- A **Proxy Route** may return an **Upstream Error**
- A **Control Route** may return a **Mapped Error**

## Example dialogue

> **Dev:** "Should this endpoint be a **Proxy Route** or a **Control Route**?"
> **Domain expert:** "If it forwards service calls unchanged, it's a **Proxy Route**; if it serves UI metadata, it's a **Control Route**."

## Flagged ambiguities

- "API route" was overloaded for both relay and metadata endpoints — resolved: use **Proxy Route** for relay behavior and **Control Route** for metadata behavior.
