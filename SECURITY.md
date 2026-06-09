# Security Policy

## Supported versions

| Version | Supported          |
| ------- | ------------------ |
| 1.x     | :white_check_mark: |

## Reporting a vulnerability

If you discover a security issue in Flect, please **do not** open a public GitHub issue.

Instead, email **Llewellynpaintsil34@gmail.com** with:

- A description of the vulnerability
- Steps to reproduce
- Potential impact
- Any suggested fix (optional)

You should receive a response within 7 days. We will work with you to understand and address the issue before any public disclosure.

## Scope notes

Flect is a **local control panel** that runs on `localhost:3000` and manages `adb` / `scrcpy` on your machine. It is not intended to be exposed to the public internet. Do not bind it to `0.0.0.0` or port-forward it without understanding the risks.
