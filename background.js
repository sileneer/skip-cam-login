chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.type === "show_notification") {
        chrome.notifications.create({
            type: "basic",
            iconUrl: "icon.png", // Make sure this file exists in your extension folder
            title: request.title,
            message: request.message
        });
    }
});
