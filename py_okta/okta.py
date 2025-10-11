"""Library for managing Okta session access."""

import time
from typing import Any

import requests.exceptions


class OktaException(Exception):
    """Okta access failure."""

    push_not_available = 1
    push_unknown_response = 2
    push_timeout = 3

    def __init__(
        self,
        message: str,
        code: int,
        response: requests.Response | None = None,
        **extras: Any,
    ) -> None:
        """Initialize the Okta failure details.

        Args:
            message: Error message.
            code: Okta exception error code for type identification regardless of message.
            response: Optional request response that caused the exception.
            extras: Optional extra values that caused the exception.
        """
        super().__init__(message)
        self.code = code
        self.response = response
        self.extras = dict(extras)


def get_authn_session_token(
    session: requests.Session,
    org_url: str,
    username: str,
    password: str,
    *,
    wait: int | None = None,
) -> str | None:
    """Request an Okta authn session token.

    Args:
        session: Existing HTTP session with required cookies attached, such as from a previous "/login" call.
        org_url: Base Okta organization URL, such as "https://example.okta.com".
        username: Okta username to authenticate with.
        password: Okta password for the username to authenticate with.
        wait: Maximum amount of time in seconds to wait for MFA push notification to be accepted if required.

    Returns:
        An Okta authn session token that can be used in "/authorize" calls to applications.

    Raises:
        RequestException if an HTTP request fails.
        OktaException if HTTP requests are successful but authentication fails.
    """
    authn_response = session.post(
        f"{org_url}/api/v1/authn",
        headers={"Content-Type": "application/json"},
        json={"username": username, "password": password},
    )
    authn_response.raise_for_status()
    authn_json = authn_response.json()
    authn_status = authn_json.get("status")
    session_token = None
    if authn_status == "SUCCESS":
        session_token = authn_json.get("sessionToken")
    elif authn_status == "MFA_REQUIRED":
        session_token = get_mfa_push_session_token(session, authn_json, wait=wait)
    return session_token


def get_mfa_push_session_token(
    session: requests.Session,
    authn_json: dict,
    *,
    wait: int = 60,
) -> str | None:
    """Perform an Okta MFA push and retrieve the session token.

    Args:
        session: HTTP session with required cookies attached, such as from previous "/login" and "/authn" calls.
        authn_json: Response from a previously successful "/authn" call where "status" was "MFA_REQUIRED".
        wait: Maximum amount of time in seconds, up to 5 minutes, to wait for the push notification to be accepted.

    Returns:
        An Okta authn session token that can be used in "/authorize" calls to applications.

    Raises:
        RequestException if an HTTP request fails.
        OktaException if HTTP requests are successful but authentication fails.
    """
    wait = max(0, min(wait or 60, 300))
    session_token = None
    mfa_push = None
    for factor in authn_json.get("_embedded", {}).get("factors", []):
        if factor.get("factorType") == "push":
            mfa_push = factor
            break
    if not mfa_push:
        raise OktaException("No MFA push option available", OktaException.push_not_available, json=authn_json)
    verify_href = mfa_push.get("_links", {}).get("verify", {}).get("href")
    state_token = authn_json.get("stateToken")
    print(f"Waiting for push notification up to {wait} seconds...")
    refresh = 3
    for _ in range(wait // refresh):
        mfa_response = session.post(
            verify_href,
            headers={"Content-Type": "application/json", "Accept": "application/json"},
            json={"stateToken": state_token},
        )
        mfa_response.raise_for_status()
        mfa_json = mfa_response.json()
        if mfa_json.get("factorResult") == "WAITING":
            time.sleep(refresh)
            continue
        if mfa_json.get("status") == "SUCCESS":
            session_token = mfa_json.get("sessionToken")
            break
        raise OktaException("MFA push unknown response", OktaException.push_unknown_response, json=mfa_json)
    if not session_token:
        raise OktaException("MFA push timed out", OktaException.push_timeout)
    return session_token


def get_application_cookies(
    session: requests.Session,
    okta_org_url: str,
    app_login_url: str,
    username: str,
    password: str,
    *,
    wait: int | None = None,
) -> list[str]:
    """Request Okta session cookies for an application using its login and callback flow.

    Args:
        session: Existing HTTP session with required cookies attached, such as from a previous "/login" call.
        okta_org_url: Base Okta organization URL, such as "https://example.okta.com".
        app_login_url: Application login URL, such as "https://example.app.com/login".
        username: Okta username to authenticate with.
        password: Okta password for the username to authenticate with.
        wait: Maximum amount of time in seconds to wait for MFA push notification to be accepted if required.

    Returns:
        Okta session cookies that can be used to authorize calls to an application's endpoints.

    Raises:
        RequestException if an HTTP request fails.
        OktaException if HTTP requests are successful but authentication fails.
    """
    # Perform "login" first; there is no reason to create an Okta session token if we cannot begin the login process.
    # Provides a pre-initialized "/authorize" link with a "nonce" and "state" ready for approving an app session.
    login_response = session.get(
        app_login_url,
        cookies={"login_hint": username},
        allow_redirects=False,
    )
    login_response.raise_for_status()

    # Perform "authorize" second; reuse the pre-approved login path and cookies.
    # Provides an app callback to complete the session exchange for an approved application cookie.
    auth_url = login_response.headers["location"]
    session_token = get_authn_session_token(session, okta_org_url, username, password, wait=wait)
    authorize_response = session.get(
        f"{auth_url}&sessionToken={session_token}",
        allow_redirects=False,
    )
    authorize_response.raise_for_status()

    # Finalize the application session exchange; reuse the session to ensure all required cookies are present.
    # Provides a response with both a redirect to access the main application page and session cookies to use.
    callback_url = authorize_response.headers["location"]
    callback_response = session.get(
        callback_url,
        allow_redirects=False,
    )
    callback_response.raise_for_status()

    cookies = callback_response.headers.get("set-cookie", "").split("; ")
    return cookies


def main() -> None:
    """Demonstrate Okta session access."""
    import getpass  # pylint: disable=import-outside-toplevel

    okta_org_url = input("Okta organization URL (e.g. https://example.okta.com): ")
    app_login_url = input("Application login URL (e.g. https://example.app.com/login): ")
    username = input("Username: ")
    password = getpass.getpass("Password: ")

    with requests.Session() as session:
        try:
            cookies = get_application_cookies(
                session,
                okta_org_url,
                app_login_url,
                username,
                password,
            )
        except OktaException as exception:
            print(f"Okta authentication failure: {exception}")
        except requests.exceptions.RequestException as exception:
            print(f"Okta connection failure: {exception}")
        cookies = dict((cookie.split("=", 1) if "=" in cookie else (cookie, True) for cookie in cookies))

        session_cookie = cookies.get("okta-hosted-login-session-store")
        print(f"okta-hosted-login-session-store={session_cookie}")


if __name__ == "__main__":
    main()
