# 0018 - AES-256-GCM Encryption for Twitch Tokens

## Status

Accepted

## Context

Twitch access and refresh tokens are stored in D1 (`twitch_tokens`). If the database is compromised, plaintext tokens give an attacker full API access for every user.

Requirements for the MVP encryption scheme:

- Must run inside a Cloudflare Worker (Web Crypto API only; no Node.js `crypto` module).
- The encryption key must be injectable via an environment secret (`TOKEN_ENCRYPTION_KEY`) so it can differ per environment.
- The key format must not require a specific byte length in `.dev.vars` (a plain string placeholder like `dev-encryption-placeholder` must work for local development).
- Decryption must be deterministic given the same ciphertext and key.

## Decision

Use **AES-256-GCM** via `crypto.subtle`.

Derive the 256-bit key by SHA-256 hashing the raw `TOKEN_ENCRYPTION_KEY` string. This allows any-length secret strings including short dev placeholders without adding PBKDF2 iteration cost on every token operation.

Ciphertext format stored in D1: `{base64url_iv}:{base64url_ciphertext}` — both fields in a single text column.

A fresh random 12-byte IV is generated for every encrypt call (standard AES-GCM practice).

## Consequences

- AES-GCM provides both confidentiality and integrity; tampered ciphertexts fail decryption.
- The SHA-256 derivation step is fast (single hash) but provides no key stretching — the security of `TOKEN_ENCRYPTION_KEY` depends entirely on the entropy of the secret value. Production keys should be randomly generated (e.g. `openssl rand -base64 32`).
- Rotating the key requires re-encrypting all stored tokens; no key-versioning scheme is implemented for MVP.
- `dev-encryption-placeholder` works for local development but is intentionally weak.
