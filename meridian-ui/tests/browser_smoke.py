"""Browser workflows, keyboard behavior, PDF export and axe accessibility checks.

Run against tests/serve_fixture.py and Vite pointed at its API, never a live database.
"""
import argparse
import io
import json
import re
from pathlib import Path

import pypdf
from playwright.sync_api import expect, sync_playwright


AXE_PATH = Path(__file__).resolve().parents[1] / 'node_modules/axe-core/axe.min.js'


def run(url: str, output: str | None):
    artifacts = Path(output) if output else None
    if artifacts:
        artifacts.mkdir(parents=True, exist_ok=True)
    accessibility = []
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(channel='msedge', headless=True)
        context = browser.new_context(viewport={'width': 1440, 'height': 1000})
        context.grant_permissions(['clipboard-read', 'clipboard-write'], origin=url)
        page = context.new_page()
        errors = []
        page.on('pageerror', lambda error: errors.append(str(error)))
        page.goto(url)

        def audit(name):
            page.add_script_tag(path=str(AXE_PATH))
            result = page.evaluate("""async () => {
                const result = await axe.run(document, {
                    runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa', 'best-practice'] }
                });
                return { violations: result.violations.map(item => ({ id: item.id, impact: item.impact,
                    description: item.description, nodes: item.nodes.map(node => ({ target: node.target, summary: node.failureSummary })) })),
                    passes: result.passes.length, incomplete: result.incomplete.map(item => item.id) };
            }""")
            accessibility.append({'view': name, **result})
            if artifacts:
                (artifacts / 'accessibility.json').write_text(json.dumps(accessibility, indent=2), encoding='utf-8')
            assert not result['violations'], f"Accessibility failures in {name}: {json.dumps(result['violations'], indent=2)}"

        def screenshot(name):
            if artifacts:
                page.screenshot(path=str(artifacts / f'{name}.png'), full_page=True)

        def choose(label, option):
            page.get_by_role('combobox', name=label, exact=True).click()
            page.get_by_role('option', name=option, exact=True).click()

        def login(email):
            page.get_by_label('Work email').fill(email)
            page.get_by_label('Password', exact=True).fill('MeridianDemo!2026')
            page.get_by_role('button', name='Sign in', exact=True).click()

        def logout():
            page.get_by_role('button', name='Sign out', exact=True).click()
            expect(page.get_by_role('heading', name='Sign in', exact=True)).to_be_visible()

        def mobile(name):
            page.set_viewport_size({'width': 390, 'height': 844})
            screenshot(name + '-mobile')
            overflow = page.evaluate("""() => Array.from(document.querySelectorAll('body *')).filter(element => { const rect = element.getBoundingClientRect(); return rect.width > 0 && rect.right > window.innerWidth + 1 && getComputedStyle(element).position !== 'absolute' }).slice(0, 20).map(element => ({ tag: element.tagName, classes: element.className, width: element.getBoundingClientRect().width, right: element.getBoundingClientRect().right }))""")
            assert page.evaluate('document.documentElement.scrollWidth <= window.innerWidth'), f'{name}: mobile horizontal overflow: {overflow}'
            short_controls = page.locator('input:not([type=checkbox]), [role=combobox]').evaluate_all(
                """elements => elements.filter(element => {
                    const rect = element.getBoundingClientRect();
                    return rect.width > 0 && rect.height > 0 && rect.height < 39.9;
                }).map(element => ({ name: element.getAttribute('aria-label') || element.id,
                    height: element.getBoundingClientRect().height }))"""
            )
            assert not short_controls, f'{name}: mobile controls below 40px: {short_controls}'
            audit(name + '-mobile')
            page.set_viewport_size({'width': 1440, 'height': 1000})

        # Accessible client-side form errors and server validation.
        expect(page.get_by_role('heading', name='Sign in', exact=True)).to_be_visible()
        page.get_by_role('button', name='Sign in', exact=True).click()
        expect(page.get_by_label('Work email')).to_have_attribute('aria-invalid', 'true')
        expect(page.get_by_label('Password', exact=True)).to_have_attribute('aria-invalid', 'true')
        login('morgan.hayes@meridian.example')
        expect(page.get_by_role('heading', name='Which renewals need attention?')).to_be_visible()
        logout()
        page.get_by_label('Work email').fill('morgan.hayes@meridian.example')
        page.get_by_label('Password', exact=True).fill('wrong-password')
        page.get_by_role('button', name='Sign in', exact=True).click()
        expect(page.get_by_role('alert')).to_contain_text('incorrect')
        audit('sign-in')
        screenshot('sign-in')
        mobile('sign-in')

        # Regional metrics, filters, sorting, pagination and column visibility.
        login('morgan.hayes@meridian.example')
        expect(page.get_by_role('button', name='Table view', exact=True)).to_be_visible()
        expect(page.get_by_role('button', name='Card view', exact=True)).to_have_attribute('aria-pressed', 'true')
        expect(page.locator('.portfolio-client-card')).to_have_count(9)
        audit('regional-client-cards')
        screenshot('regional-client-cards')
        mobile('regional-client-cards')
        page.get_by_role('textbox', name='Search portfolio cards', exact=True).fill('Riverside')
        expect(page.locator('.portfolio-client-card')).to_have_count(1)
        page.get_by_role('button', name='Inspect Riverside Manufacturing', exact=True).click()
        expect(page.get_by_role('dialog')).to_contain_text('$1,200,000')
        page.keyboard.press('Escape')
        page.get_by_role('textbox', name='Search portfolio cards', exact=True).fill('')
        page.get_by_role('button', name='Table view', exact=True).click()
        expect(page.locator('.portfolio-table tbody tr')).to_have_count(9)
        expect(page.locator('.regional-kpis')).to_contain_text('$2.77M')
        expect(page.get_by_role('heading', name='Risk distribution')).to_be_visible()
        audit('regional-portfolio')
        screenshot('regional-dashboard')
        choose('Risk filter', 'High risk')
        expect(page.locator('.portfolio-table tbody tr')).to_have_count(3)
        choose('Producer filter', 'Priya Nair')
        expect(page.locator('.portfolio-table tbody tr')).to_have_count(1)
        expect(page.locator('.portfolio-table')).to_contain_text('Northwind Foods')
        page.get_by_role('button', name='Clear filters', exact=True).click()
        choose('Renewal filter', 'Within 90 days / overdue')
        expect(page.locator('.portfolio-table tbody tr')).to_have_count(6)
        choose('Renewal filter', 'All renewals')
        expect(page.locator('.portfolio-table tbody tr')).to_have_count(9)
        choose('Rows per page', '5 / page')
        expect(page.locator('.portfolio-table tbody tr')).to_have_count(5)
        page.get_by_role('button', name='Next page', exact=True).click()
        expect(page.locator('.portfolio-table tbody tr')).to_have_count(4)
        page.get_by_role('textbox', name='Search portfolio clients').fill('Riverside')
        expect(page.locator('.portfolio-table tbody tr')).to_have_count(1)
        page.get_by_role('textbox', name='Search portfolio clients').fill('')
        choose('Rows per page', '10 / page')
        page.get_by_role('button', name='Columns', exact=True).click()
        page.get_by_role('menuitemcheckbox', name='Producer', exact=True).click()
        expect(page.locator('.portfolio-table th').filter(has_text='Producer')).to_have_count(0)
        page.get_by_role('menuitemcheckbox', name='Producer', exact=True).click()
        page.keyboard.press('Escape')
        page.locator('.portfolio-table th').get_by_role('button', name='Premium', exact=True).click()
        values = page.locator('.portfolio-table tbody tr').evaluate_all("rows => rows.map(row => Number(row.cells[2].textContent.replace(/[^0-9.]/g, '')))")
        assert values == sorted(values), 'Premium sorting is not numeric'
        first_row = page.locator('.portfolio-table tbody tr').first
        first_row.focus()
        page.keyboard.press('ArrowDown')
        expect(page.locator('.portfolio-table tbody tr').nth(1)).to_be_focused()
        trigger = page.get_by_role('button', name='Inspect Riverside Manufacturing', exact=True)
        trigger.click()
        expect(page.get_by_role('dialog')).to_contain_text('$1,200,000')
        audit('regional-record-sheet')
        page.keyboard.press('Escape')
        expect(page.get_by_role('dialog')).to_have_count(0)
        expect(trigger).to_be_focused()
        page.locator('.portfolio-table').get_by_role('button', name='Riverside Manufacturing', exact=True).click()
        page.get_by_role('button', name='Open full brief', exact=True).click()
        expect(page.locator('.client-title')).to_have_text('Riverside Manufacturing')
        expect(page.locator('.completeness-badge')).to_contain_text('1 of 1')
        expect(page.locator('.agenda-panel')).to_be_visible()
        audit('leadership-brief')
        page.get_by_role('button', name='Back to regional portfolio').click()
        page.get_by_role('button', name='Table view', exact=True).click()
        expect(page.locator('.portfolio-table tbody tr')).to_have_count(9)
        cookie = next(cookie for cookie in context.cookies() if cookie['name'] == 'meridian_session')
        assert cookie['httpOnly'] and cookie['sameSite'] == 'Strict'
        mobile('regional-dashboard')
        page.reload()
        page.get_by_role('button', name='Table view', exact=True).click()
        expect(page.locator('.portfolio-table tbody tr')).to_have_count(9)
        logout()

        # First loading uses accessible skeletons and a current-data workspace.
        pending_briefs = []

        def hold_initial_brief(route):
            pending_briefs.append(route)

        page.route(url + '/accounts/A01/brief', hold_initial_brief)
        login('jordan.davis@meridian.example')
        expect(page.locator('.main-column .ui-skeleton').first).to_be_visible()
        expect(page.locator('.main-column [role=status]')).to_contain_text('Loading')
        page.emulate_media(reduced_motion='reduce')
        assert page.locator('.main-column .ui-skeleton').first.evaluate(
            "element => getComputedStyle(element).animationName === 'none'"
        ), 'Skeleton motion should stop for reduced-motion preference'
        audit('producer-loading-skeleton')
        screenshot('producer-loading-skeleton')
        assert pending_briefs, 'Expected a suspended initial brief request'
        pending_briefs.pop().continue_()
        page.unroute(url + '/accounts/A01/brief', hold_initial_brief)
        page.emulate_media(reduced_motion='no-preference')

        # Producer scope, record drawers, source reconciliation and full documents.
        expect(page.locator('.account-list .account-option')).to_have_count(5)
        expect(page.locator('.client-title')).to_have_text('Riverside Manufacturing')
        expect(page.locator('.snapshot-grid .snapshot-card')).to_have_count(4)
        expect(page.locator('.completeness-badge')).to_contain_text('1 of 1')
        audit('producer-overview')
        screenshot('producer-dashboard')
        mobile('producer-dashboard')
        page.get_by_role('tab', name='Policies', exact=True).click()
        expect(page.locator('.details-panel tbody tr')).to_have_count(3)
        page.get_by_role('button', name='Inspect PA-77821', exact=True).click()
        expect(page.get_by_role('dialog')).to_contain_text('Conflicting dates')
        expect(page.get_by_role('dialog')).to_contain_text('Oct 25, 2026')
        audit('policy-record-sheet')
        page.keyboard.press('Escape')
        page.get_by_role('tab', name='Service cases', exact=True).click()
        expect(page.locator('.details-panel tbody tr')).to_have_count(1)
        expect(page.locator('.details-panel')).to_contain_text('Client escalated slow response')
        page.get_by_role('tab', name='Documents', exact=True).click()
        page.get_by_role('button', name='Inspect Riverside Q3 review notes', exact=True).click()
        expect(page.get_by_role('dialog')).to_contain_text('No cyber discussion on record.')
        page.keyboard.press('Tab')
        assert page.evaluate("document.querySelector('[role=dialog]').contains(document.activeElement)"), 'Dialog lost keyboard focus'
        audit('document-record-sheet')
        page.keyboard.press('Escape')
        page.get_by_role('tab', name='Claims', exact=True).click()
        expect(page.locator('.details-panel')).to_contain_text('$185,000')
        audit('claims-table')
        page.get_by_role('tab', name='Billing', exact=True).click()
        expect(page.locator('.details-panel tbody tr')).to_have_count(1)
        page.get_by_role('tab', name='Overview', exact=True).click()
        page.get_by_role('button', name='Evidence & confidence', exact=False).first.click()
        expect(page.locator('.evidence-entry').first).to_be_visible()
        audit('expanded-signal-evidence')
        page.get_by_label('Search your clients', exact=True).fill('Healthcare')
        expect(page.locator('.account-list .account-option')).to_have_count(1)

        # An automatic-generation error preserves current cards and offers a retry.
        generation_starts = []

        def fail_first_generation(route):
            generation_starts.append(route.request.post_data)
            if len(generation_starts) == 1:
                route.fulfill(status=503, content_type='application/json', body=json.dumps({
                    'detail': 'Generation is temporarily unavailable. Please retry.'
                }))
            else:
                route.continue_()

        page.route(url + '/accounts/A02/brief/jobs', fail_first_generation)
        page.get_by_role('button', name='Horizon Health Systems', exact=False).click()
        page.get_by_label('Search your clients', exact=True).fill('')
        expect(page.locator('.client-title')).to_have_text('Horizon Health Systems')
        expect(page.locator('.completeness-badge')).to_contain_text('open claims reviewed')
        expect(page.get_by_role('alert').filter(has_text='temporarily unavailable').first).to_be_visible()
        expect(page.locator('.snapshot-grid .snapshot-card')).to_have_count(4)
        audit('generation-retry-with-current-cards')
        screenshot('generation-retry')
        page.get_by_role('button', name=re.compile('Retry.*(AI|brief)', re.I)).click()
        expect(page.locator('.generation-status').first).to_be_visible()
        screenshot('generation-progress')
        audit('generation-progress')

        # Late generation completion must not replace another client's workspace.
        page.get_by_role('button', name='Riverside Manufacturing', exact=False).first.click()
        expect(page.locator('.client-title')).to_have_text('Riverside Manufacturing')
        expect(page.get_by_role('button', name='Regenerate AI Brief', exact=True)).to_be_enabled(timeout=30000)
        page.get_by_role('button', name='Horizon Health Systems', exact=False).first.click()
        expect(page.locator('.client-title')).to_have_text('Horizon Health Systems')
        expect(page.get_by_role('button', name='Regenerate AI Brief', exact=True)).to_be_enabled(timeout=30000)
        assert len(generation_starts) == 2, 'Automatic generation repeated after retry or account switch'
        page.unroute(url + '/accounts/A02/brief/jobs', fail_first_generation)
        expect(page.locator('.completeness-badge')).to_contain_text('open claims reviewed', timeout=30000)
        page.get_by_role('tab', name='Overview', exact=True).focus()
        page.keyboard.press('ArrowRight')
        expect(page.get_by_role('tab', name='AI Brief', exact=True)).to_be_focused()
        expect(page.locator('.agenda-panel')).to_be_visible()
        audit('producer-ai-brief')
        screenshot('producer-ai-brief')
        mobile('producer-ai-brief')
        citation = page.get_by_role('button', name=re.compile('Inspect citation ')).first
        citation.click()
        expect(page.get_by_role('dialog')).to_be_visible()
        audit('ai-citation-record')
        screenshot('ai-citation-record')
        page.keyboard.press('Escape')
        expect(citation).to_be_focused()
        page.get_by_role('button', name=re.compile('^(Prepare draft|Review action)$')).first.click()
        expect(page.get_by_role('dialog', name='Review suggested action')).to_be_visible()
        expect(page.get_by_label('Title', exact=True)).to_have_value(re.compile('.+'))
        draft = page.get_by_label('Draft content', exact=True)
        expect(draft).to_have_value(re.compile('.+'))
        draft.fill(draft.input_value() + '\nReviewed against the latest client records.')
        expect(page.get_by_role('button', name='Copy reviewed draft', exact=True)).to_be_enabled()
        audit('review-action-draft')
        screenshot('review-action-draft')
        expected_clipboard = page.get_by_label('Title', exact=True).input_value() + '\n\n' + draft.input_value()
        page.get_by_role('button', name='Copy reviewed draft', exact=True).click()
        expect(page.get_by_text('Reviewed draft copied to clipboard', exact=True)).to_be_visible()
        copied = page.evaluate('navigator.clipboard.readText()').replace('\r\n', '\n')
        assert copied == expected_clipboard, f'Copied draft differs: {copied!r} != {expected_clipboard!r}'
        page.keyboard.press('Escape')
        page.evaluate("document.body.classList.add('printing-ai-brief')")
        page.emulate_media(media='print')
        pdf = page.pdf(format='Letter')
        assert len(pypdf.PdfReader(io.BytesIO(pdf)).pages) == 1, 'Brief export exceeded one physical page'
        if artifacts:
            (artifacts / 'client-brief.pdf').write_bytes(pdf)
        page.evaluate("document.body.classList.remove('printing-ai-brief')")
        page.emulate_media(media='screen')
        assert page.request.get(url + '/accounts/A05/documents').status == 403
        assert page.request.get(url + '/accounts/A05/brief?user_id=U2').status == 403
        page.get_by_role('button', name='Find a client', exact=True).click()
        page.get_by_role('textbox', name='Search authorized clients').fill('Columbus')
        expect(page.get_by_role('dialog')).to_contain_text('Horizon Health Systems')
        page.keyboard.press('Escape')
        logout()

        # Restricted resource handling and cache isolation for another producer.
        login('priya.nair@meridian.example')
        expect(page.locator('.account-list .account-option')).to_have_count(5)
        assert not page.locator('.account-list').get_by_text('Riverside Manufacturing', exact=True).count()
        page.get_by_role('button', name='Harbor Marine Partners', exact=False).click()
        expect(page.locator('.client-title')).to_have_text('Harbor Marine Partners')
        page.get_by_role('tab', name='Documents', exact=True).click()
        expect(page.locator('.details-error')).to_contain_text('outside your authorized access')
        audit('restricted-documents')
        logout()
        assert page.request.get(url + '/accounts').status == 401
        assert not errors, errors
        print(f'Browser smoke passed: 3 roles, filters, table tools, record sheets, keyboard navigation, skeletons, generation progress/retry/account isolation, one-page PDF, mobile overflow, RBAC, session/logout; {len(accessibility)} axe views with zero violations.')
        browser.close()


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--url', default='http://127.0.0.1:5174')
    parser.add_argument('--output')
    args = parser.parse_args()
    run(args.url.rstrip('/'), args.output)
