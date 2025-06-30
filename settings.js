// Initialize the popup UI based on stored settings
document.addEventListener('DOMContentLoaded', function() {
  const moodleToggle = document.getElementById('moodle-toggle');
  const panoptoToggle = document.getElementById('panopto-toggle');
  const notificationToggle = document.getElementById('notification-toggle');
  const bmcButton = document.getElementById('bmc-button');

  // Load saved settings from storage
  chrome.storage.sync.get(['moodle_status', 'panopto_status', 'notification_status'], function(result) {
    // Set default values if not found in storage
    const moodleEnabled = result.moodle_status !== undefined ? result.moodle_status : true;
    const panoptoEnabled = result.panopto_status !== undefined ? result.panopto_status : true;
    const notificationEnabled = result.notification_status !== undefined ? result.notification_status : true;

    // Update UI to reflect current settings
    updateToggleState(moodleToggle, moodleEnabled);
    updateToggleState(panoptoToggle, panoptoEnabled);
    updateToggleState(notificationToggle, notificationEnabled);
  });

  // Add change event listeners to toggle switches
  moodleToggle.addEventListener('change', function() {
    // Get current state from checkbox
    const newStatus = moodleToggle.checked;

    // Update toggle state
    updateToggleState(moodleToggle, newStatus);

    // Save to storage
    chrome.storage.sync.set({ moodle_status: newStatus });
  });

  panoptoToggle.addEventListener('change', function() {
    // Get current state from checkbox
    const newStatus = panoptoToggle.checked;

    // Update toggle state
    updateToggleState(panoptoToggle, newStatus);

    // Save to storage
    chrome.storage.sync.set({ panopto_status: newStatus });
  });

  notificationToggle.addEventListener('change', function() {
    // Get current state from checkbox
    const newStatus = notificationToggle.checked;

    // Update toggle state
    updateToggleState(notificationToggle, newStatus);

    // Save to storage
    chrome.storage.sync.set({ notification_status: newStatus });
  });

  // Add click event listener for Buy Me a Coffee button
  bmcButton.addEventListener('click', function() {
    // Open the Buy Me a Coffee URL in a new tab
    chrome.tabs.create({ url: 'https://buymeacoffee.com/sileneer' });
  });
});

// Helper function to update toggle switch state
function updateToggleState(toggleElement, enabled) {
  // Set checkbox state
  toggleElement.checked = enabled;
}
