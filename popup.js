// Initialize the popup UI based on stored settings
document.addEventListener('DOMContentLoaded', function() {
  const moodleToggleBtn = document.getElementById('moodle-toggle');
  const panoptoToggleBtn = document.getElementById('panopto-toggle');
  const bmcButton = document.getElementById('bmc-button');

  // Load saved settings from storage
  chrome.storage.sync.get(['moodle_status', 'panopto_status'], function(result) {
    // Set default values if not found in storage
    const moodleStatus = result.moodle_status !== undefined ? result.moodle_status : true;
    const panoptoStatus = result.panopto_status !== undefined ? result.panopto_status : true;

    // Update UI to reflect current settings
    updateButtonState(moodleToggleBtn, moodleStatus);
    updateButtonState(panoptoToggleBtn, panoptoStatus);
  });

  // Add click event listeners to toggle buttons
  moodleToggleBtn.addEventListener('click', function() {
    // Get current state from button class
    const currentStatus = !moodleToggleBtn.classList.contains('disabled');
    // Toggle the state
    const newStatus = !currentStatus;

    // Update button appearance
    updateButtonState(moodleToggleBtn, newStatus);

    // Save to storage
    chrome.storage.sync.set({ moodle_status: newStatus });
  });

  panoptoToggleBtn.addEventListener('click', function() {
    // Get current state from button class
    const currentStatus = !panoptoToggleBtn.classList.contains('disabled');
    // Toggle the state
    const newStatus = !currentStatus;

    // Update button appearance
    updateButtonState(panoptoToggleBtn, newStatus);

    // Save to storage
    chrome.storage.sync.set({ panopto_status: newStatus });
  });

  // Add click event listener for Buy Me a Coffee button
  bmcButton.addEventListener('click', function() {
    // Open the Buy Me a Coffee URL in a new tab
    chrome.tabs.create({ url: 'https://buymeacoffee.com/sileneer' });
  });
});

// Helper function to update button appearance based on state
function updateButtonState(button, enabled) {
  if (enabled) {
    button.classList.remove('disabled');
    button.textContent = 'Enabled';
  } else {
    button.classList.add('disabled');
    button.textContent = 'Disabled';
  }
}
