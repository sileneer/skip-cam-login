// Initialize the blacklist website list
let blacklist = [];

// Variable to track the last notification time
let lastNotificationTime = 0;

// Function to check if the page is visible to the user
function isPageVisible() {
    return document.visibilityState === 'visible';
}

// Load status values from storage
chrome.storage.sync.get(['moodle_status', 'panopto_status', 'notification_status'], function (result) {
    // Update variables if found in storage
    if (result.moodle_status !== undefined && !result.moodle_status) {
        blacklist.push("MOODLE");
    }
    if (result.panopto_status !== undefined && result.panopto_status) {
        blacklist.push("PANOPTO");
    }

    // Log the blacklist items before clicking
    console.log('Auto Clicker: Blacklisted items:', blacklist.length > 0 ? blacklist.join(', ') : 'None');

    // Store notification status (default to true if not set)
    window.notificationEnabled = result.notification_status !== undefined ? result.notification_status : true;

    // Only run the auto-click function if the page is visible
    if (isPageVisible()) {
        // Run the auto-click function after loading settings
        setTimeout(autoClickElement, 100);
    } else {
        console.log('Auto Clicker: Page is not visible, waiting for visibility change');
        // Add event listener to run when the page becomes visible
        document.addEventListener('visibilitychange', function() {
            if (isPageVisible()) {
                console.log('Auto Clicker: Page became visible, running auto-click');
                autoClickElement();
            }
        });
    }
});

// This function will try to find and click the element.
function autoClickElement() {
    // IMPORTANT: Change this selector to target the element you want to click.
    // Examples:
    // const elementSelector = '#submitButton'; // For an element with id="submitButton"
    // const elementSelector = '.some-class-name'; // For an element with class="some-class-name"
    // const elementSelector = 'button[name="actionButton"]'; // For a button with name="actionButton"

    const url = window.location.href;

    let elementSelector = false;
    let targetElement = false;
    let current_name;

    // Log the current URL and blacklist status
    console.log('Auto Clicker: Checking URL:', url);
    console.log('Auto Clicker: Current blacklist status:', blacklist.length > 0 ? blacklist.join(', ') : 'No items blacklisted');



    if (url === "https://www.vle.cam.ac.uk/login/index.php") {
        if (!blacklist.includes("MOODLE")) {
            elementSelector = 'a.btn.btn-secondary';
            current_name = "Moodle";
        } else {
            console.log('Auto Clicker: Skipping Moodle login because it is in the blacklist');
        }
    }
    if (url.startsWith("https://cambridgelectures.cloud.panopto.eu/Panopto/Pages/Auth/Login.aspx")) {
        if (!blacklist.includes("PANOPTO")) {
            elementSelector = '#PageContentPlaceholder_loginControl_externalLoginButton';
            current_name = "Panopto";
        } else {
            console.log('Auto Clicker: Skipping Panopto login because it is in the blacklist');
        }
    }

    if (elementSelector) {
        targetElement = document.querySelector(elementSelector);
    }

    if (targetElement) {
        console.log('Auto Clicker: Element found:', targetElement);
        // Ensure the element is actually clickable (e.g., visible, not disabled)
        // This is a basic check; more sophisticated checks might be needed for complex UIs.
        if (typeof targetElement.click === 'function') {
            targetElement.click();
            console.log('Auto Clicker: Element clicked!');
            // ✅ Send notification if enabled and not throttled (5-second cooldown)
            if (window.notificationEnabled) {
                const currentTime = Date.now();
                // Only send notification if 5 seconds have passed since the last one
                if (currentTime - lastNotificationTime > 5000) {
                    chrome.runtime.sendMessage({
                        type: "show_notification",
                        title: "Login Skipped",
                        message: "Login button on " + current_name + " clicked automatically."
                    });
                    // Update the last notification time
                    lastNotificationTime = currentTime;
                } else {
                    console.log('Auto Clicker: Notification throttled (cooldown period)');
                }
            }
        } else {
            console.error('Auto Clicker: Element found, but does not have a click method.', targetElement);
        }
    } else {
        if (elementSelector) {
            console.warn('Auto Clicker: Element not found with selector:', elementSelector);
        }
        // Optionally, you could retry after a short delay if the element might appear later
        // For example, to retry after 1 second:
        // setTimeout(autoClickElement, 1000);
    }
}

// The 'run_at': 'document_idle' in manifest.json means this script runs
// when the DOM is complete. For many cases, this is sufficient.
// Adding a small delay can sometimes help if the page is still doing some final rendering
// or if the element appears shortly after 'document_idle'.
// Note: We now call setTimeout in the chrome.storage.sync.get callback above

// --- More Advanced: For elements that appear due to JavaScript after initial load ---
// If the simple timeout above isn't reliable because the element takes an unpredictable
// amount of time to appear (e.g., loaded via an API call), you can use a MutationObserver.
// Uncomment the code block below to use it. Make sure to also comment out or remove
// the `setTimeout(autoClickElement, 500);` line above if you use the observer.

/*
const ELEMENT_SELECTOR_FOR_OBSERVER = '#yourElementId'; // <<<< CHANGE THIS to the same selector

const observer = new MutationObserver((mutationsList, obs) => {
    const targetElement = document.querySelector(ELEMENT_SELECTOR_FOR_OBSERVER);
    if (targetElement) {
        console.log('Auto Clicker (Observer): Element found, attempting click.');
        if (typeof targetElement.click === 'function') {
            targetElement.click();
            console.log('Auto Clicker (Observer): Element clicked!');
            obs.disconnect(); // Stop observing once the element is found and clicked.
        } else {
            console.error('Auto Clicker (Observer): Element found, but does not have a click method.', targetElement);
        }
    }
});

// Start observing the document body for added nodes and changes in the subtree.
observer.observe(document.body, {
    childList: true, // Observe direct children additions/removals
    subtree: true    // Observe all descendants
});

// Optional: Set a timeout to stop observing if the element isn't found after a certain period.
setTimeout(() => {
    const stillObserving = observer.takeRecords().length > 0 || document.querySelector(ELEMENT_SELECTOR_FOR_OBSERVER) === null;
    if (stillObserving) { // Check if we are still observing (i.e. element not found and clicked)
        observer.disconnect();
        console.log('Auto Clicker (Observer): Timed out waiting for element. Observer disconnected.');
    }
}, 10000); // Stop observing after 10 seconds if the element hasn't been found.
*/
