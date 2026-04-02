from playwright.sync_api import sync_playwright

def run_cuj(page):
    page.goto("file:///app/popup.html")
    page.wait_for_timeout(500)

    # Test focus state on inputs
    page.locator("#ghOwner").focus()
    page.wait_for_timeout(500)

    # Test focus state on buttons
    page.locator("#startBtn").focus()
    page.wait_for_timeout(500)

    # Click start to see progress section
    page.locator("#startBtn").click()
    page.wait_for_timeout(500)

    # Take screenshot
    page.screenshot(path="/tmp/verification.png")
    page.wait_for_timeout(1000)

if __name__ == "__main__":
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(
            record_video_dir="/tmp/videos"
        )
        page = context.new_page()
        try:
            run_cuj(page)
        finally:
            context.close()
            browser.close()
