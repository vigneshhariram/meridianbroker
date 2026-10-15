"""Optional browser smoke check for Meridian Copilot. Run against an isolated API/seed."""

import argparse
from pathlib import Path
from playwright.sync_api import sync_playwright, expect


def run(url: str, screenshot: str | None):
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(channel="msedge", headless=True)
        context = browser.new_context(viewport={"width": 1440, "height": 1000})
        page = context.new_page()
        errors = []
        page.on("pageerror", lambda error: errors.append(str(error)))
        page.goto(url)

        def login(email):
            page.get_by_label("Work email").fill(email)
            page.get_by_label("Password", exact=True).fill("MeridianDemo!2026")
            page.get_by_role("button", name="Sign in", exact=True).click()

        # 1. Invalid login check
        page.get_by_label("Work email").fill("morgan.hayes@meridian.example")
        page.get_by_label("Password", exact=True).fill("wrong-password")
        page.get_by_role("button", name="Sign in", exact=True).click()
        expect(page.get_by_role("alert")).to_contain_text("incorrect")

        # 2. Regional Leader login & portfolio view
        login("morgan.hayes@meridian.example")
        expect(page.get_by_role("heading", name="Which renewals need attention?")).to_be_visible()
        expect(page.locator(".portfolio-table tbody tr")).to_have_count(9)
        expect(page.locator(".regional-kpis")).to_contain_text("$2.77M")

        if screenshot:
            page.screenshot(path=screenshot, full_page=True)

        # Filters check
        page.get_by_label("Risk filter").select_option("high")
        expect(page.locator(".portfolio-table tbody tr")).to_have_count(3)
        page.get_by_label("Producer filter").select_option("U2")
        expect(page.locator(".portfolio-table tbody tr")).to_have_count(1)
        expect(page.locator(".portfolio-table")).to_contain_text("Northwind Foods")
        page.get_by_label("Risk filter").select_option("")
        page.get_by_label("Producer filter").select_option("")
        page.get_by_label("Renewal filter").select_option("90")
        expect(page.locator(".portfolio-table tbody tr")).to_have_count(6)
        page.get_by_label("Renewal filter").select_option("0")
        expect(page.locator(".portfolio-table tbody tr")).to_have_count(9)

        # Open brief from regional portfolio
        page.locator(".portfolio-table").get_by_role("button", name="Riverside Manufacturing", exact=True).click()
        page.get_by_role("button", name="Open full brief", exact=True).click()
        expect(page.locator(".client-title")).to_have_text("Riverside Manufacturing")
        expect(page.locator(".completeness-badge")).to_contain_text("1 of 1")
        expect(page.locator(".agenda-panel")).to_be_visible()

        # Return to regional portfolio
        page.get_by_role("button", name="Back to regional portfolio").click()
        expect(page.get_by_role("heading", name="Which renewals need attention?")).to_be_visible()

        # Session & responsive check
        cookie = next(cookie for cookie in context.cookies() if cookie["name"] == "meridian_session")
        assert cookie["httpOnly"] and cookie["sameSite"] == "Strict"
        page.set_viewport_size({"width": 390, "height": 844})
        assert page.evaluate("document.documentElement.scrollWidth <= window.innerWidth"), "Mobile horizontal overflow"
        if screenshot:
            page.screenshot(path=str(Path(screenshot).with_name("regional-dashboard-mobile.png")), full_page=True)
        page.set_viewport_size({"width": 1440, "height": 1000})

        # Sign out
        page.get_by_role("button", name="Sign out", exact=True).click()
        expect(page.get_by_role("heading", name="Sign in", exact=True)).to_be_visible()

        # 3. Producer Jordan Davis: Scenario 1 omission & AI regeneration
        login("jordan.davis@meridian.example")
        expect(page.locator(".account-list .account-option")).to_have_count(5)
        assert page.locator(".account-list").get_by_text("Summit Construction", exact=True).count() == 0

        # Select Horizon Health Systems (A02) - Scenario 1 omitted claim banner
        page.get_by_role("button", name="Horizon Health Systems", exact=False).click()
        expect(page.locator(".client-title")).to_have_text("Horizon Health Systems")
        expect(page.locator(".completeness-alert-box")).to_be_visible()
        expect(page.locator(".completeness-badge.alert")).to_contain_text("CLM-88410 omitted")

        # Click Regenerate AI Brief
        page.get_by_role("button", name="Regenerate AI Brief").click()
        # Verify transition to completed status
        expect(page.locator(".completeness-badge")).to_contain_text("open claims reviewed", timeout=30000)

        # Verify Overview tab operational components
        expect(page.locator(".snapshot-grid")).to_be_visible()
        expect(page.locator(".timeline-card-panel")).to_be_visible()
        expect(page.get_by_role("button", name="Print View", exact=True)).to_be_visible()
        expect(page.locator("#printable-ai-brief")).to_have_count(1)

        # Tab navigation check: Switch to dedicated AI Brief tab
        page.get_by_role("button", name="AI Brief", exact=True).click()
        expect(page.locator(".agenda-panel")).to_be_visible()
        expect(page.locator(".talking-points-panel")).to_be_visible()
        expect(page.locator(".timeline-card-panel")).not_to_be_visible()

        # Switch back to Overview tab
        page.get_by_role("button", name="Overview", exact=True).click()
        expect(page.locator(".timeline-card-panel")).to_be_visible()
        expect(page.locator(".agenda-panel")).not_to_be_visible()


        # Operational quick-action shortcut to Policies
        page.get_by_role("button", name="Overview", exact=True).click()
        page.get_by_role("button", name="View policies →").click()
        expect(page.locator(".details-panel")).to_be_visible()
        expect(page.locator(".details-panel")).to_contain_text("Policies")

        # Verify publication-ready 1-page PDF export strictly produces 1 physical page
        page.evaluate("document.body.classList.add('printing-ai-brief')")
        page.emulate_media(media="print")
        import io, pypdf
        pdf_data = page.pdf(format="Letter")
        assert len(pypdf.PdfReader(io.BytesIO(pdf_data)).pages) == 1, "Printable AI Brief exceeded 1 physical page"
        page.evaluate("document.body.classList.remove('printing-ai-brief')")
        page.emulate_media(media="screen")

        # RBAC checks
        assert page.request.get(url + "/accounts/A05/documents").status == 403
        assert page.request.get(url + "/accounts/A05/brief?user_id=U2").status == 403

        # Sign out
        page.get_by_role("button", name="Sign out", exact=True).click()
        expect(page.get_by_role("heading", name="Sign in", exact=True)).to_be_visible()

        # 4. Producer Priya Nair: Restricted document check
        login("priya.nair@meridian.example")
        expect(page.locator(".account-list .account-option")).to_have_count(5)
        assert page.locator(".account-list").get_by_text("Riverside Manufacturing", exact=True).count() == 0
        page.get_by_role("button", name="Harbor Marine Partners", exact=False).click()
        expect(page.locator(".client-title")).to_have_text("Harbor Marine Partners")
        page.get_by_role("button", name="Documents", exact=True).click()
        expect(page.locator(".details-error")).to_contain_text("outside your authorized access")

        page.get_by_role("button", name="Sign out", exact=True).click()
        expect(page.get_by_role("heading", name="Sign in", exact=True)).to_be_visible()
        assert page.request.get(url + "/accounts").status == 401
        assert not errors, errors
        print("Browser smoke checks passed cleanly: credentials, role routing, filters, brief navigation, scenario 1 regeneration, responsive design, producer RBAC, document restrictions, logout.")
        browser.close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--url", default="http://127.0.0.1:5173")
    parser.add_argument("--screenshot")
    args = parser.parse_args()
    run(args.url.rstrip("/"), args.screenshot)
