"""HTTP client for the small control API each worker container exposes on
its internal-only control port (see worker/control_server.py). The backend
is the only thing that ever talks to this - it is never reachable from the
host or the internet, only from the backend container over
`worker_network`."""
from __future__ import annotations

import httpx

CONTROL_PORT = 7000


class WorkerUnreachable(RuntimeError):
    pass


class WorkerClient:
    def __init__(self, container_name: str):
        self._base_url = f"http://{container_name}:{CONTROL_PORT}"

    def _url(self, path: str) -> str:
        return f"{self._base_url}{path}"

    def health(self, timeout: float = 5.0) -> bool:
        try:
            r = httpx.get(self._url("/health"), timeout=timeout)
            return r.status_code == 200
        except httpx.HTTPError:
            return False

    def navigate(self, url: str, timeout: float = 30.0) -> dict:
        try:
            r = httpx.post(self._url("/navigate"), json={"url": url}, timeout=timeout)
            r.raise_for_status()
            return r.json()
        except httpx.HTTPError as exc:
            raise WorkerUnreachable(str(exc)) from exc

    def autofill(self, email: str, password: str, timeout: float = 15.0) -> dict:
        """`password` never gets logged by this client or the worker (see
        worker/control_server.py) - only booleans about whether fields were
        found/filled come back."""
        try:
            r = httpx.post(
                self._url("/autofill"), json={"email": email, "password": password}, timeout=timeout
            )
            r.raise_for_status()
            return r.json()
        except httpx.HTTPError as exc:
            raise WorkerUnreachable(str(exc)) from exc

    def read(self, timeout: float = 15.0) -> dict:
        try:
            r = httpx.post(self._url("/read"), timeout=timeout)
            r.raise_for_status()
            return r.json()
        except httpx.HTTPError as exc:
            raise WorkerUnreachable(str(exc)) from exc
