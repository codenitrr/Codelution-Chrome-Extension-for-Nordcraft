/**
 * Background Script for Chrome Extension
 * 
 * This file contains the background service worker for the Chrome extension.
 * It manages events and handles communication between different parts of the extension.
 * The background script stays active while the extension is enabled, even when the
 * popup or other components are closed.
 */

// ----------------------------------------------------------------------------------
// Initialization & Setup
// ----------------------------------------------------------------------------------

// Listen for extension installation
chrome.runtime.onInstalled.addListener(() => {
    console.log("Extension installed");
});

// ----------------------------------------------------------------------------------
// Message Handling
// ----------------------------------------------------------------------------------

// Process messages from content scripts and popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    // Screenshot capture
    if (request.action === "captureScreenshot") {
        chrome.tabs.captureVisibleTab(null, {}, (image) => {
            sendResponse({ image: image });
        });
        return true; // Required for async response
    }

    // Content overwrite
    if (request.action === "overwriteText") {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            chrome.tabs.sendMessage(tabs[0].id, { 
                action: "overwriteText", 
                text: request.text 
            });
        });
    }

    // User data retrieval
    if (request.action === "getUserData") {
        const userData = {};
        sendResponse({ userData: userData });
    }

    // URL tracking for Nordcraft functionality
    if (request.type === "NORDCRAFT_ACTION") {
        if (request.action === "READ_URL") {
            console.log("Nordcraft action: URL read", request.url);
        } else if (request.action === "URL_CHANGED") {
            console.log("Nordcraft action: URL changed from", request.oldUrl, "to", request.newUrl);
            
            // Forward URL change to other parts of the extension if needed
            chrome.runtime.sendMessage({
                type: "SIDEBAR_UPDATE_URL",
                url: request.newUrl,
                title: request.title,
                tabId: sender.tab ? sender.tab.id : null,
                changeType: "spa_navigation"
            });
        }
    }

    // Custom sidebar management (now directly managed in content.js)
    if (request.action === "openSidebar") {
        console.log("Background: openSidebar request received from content.js");
        // Send message to content.js to show sidebar
        if (sender.tab) {
            chrome.tabs.sendMessage(sender.tab.id, { action: "showCustomSidebar" });
        }
    }
    
    // Note: Only return true if using async response
});

// ----------------------------------------------------------------------------------
// Tab Event Listeners
// ----------------------------------------------------------------------------------

// Listen for tab URL changes and completions
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    // When page loading is complete, check if sidebar should be restored
    if (changeInfo.status === 'complete') {
        console.log("background.js: Page loaded, checking sidebar state for:", tab.url);
        
        // Give content script time to initialize, then check sidebar state
        setTimeout(() => {
            chrome.storage.local.get(['sidebarOpen', 'lastStateChange'], (result) => {
                // Only restore if sidebar was open AND it was recently changed (within last 5 minutes)
                const fiveMinutesAgo = Date.now() - (5 * 60 * 1000);
                const wasRecentlyChanged = result.lastStateChange && result.lastStateChange > fiveMinutesAgo;
                
                if (result.sidebarOpen === true && wasRecentlyChanged) {
                    console.log("background.js: Attempting to restore sidebar state");
                    // Send message to content script to restore sidebar if needed
                    chrome.tabs.sendMessage(tabId, { 
                        action: "checkSidebarState" 
                    }).catch(() => {
                        // Ignore errors if content script not ready yet
                        console.log("Content script not ready yet, sidebar will auto-restore");
                    });
                } else if (result.sidebarOpen === true && !wasRecentlyChanged) {
                    console.log("background.js: Sidebar state is old, resetting to closed");
                    // Reset old state
                    chrome.storage.local.set({ sidebarOpen: false });
                }
            });
        }, 500);
    }
    
    // Send URL updates for existing functionality
    if (changeInfo.url || changeInfo.status === 'complete') {
        console.log("background.js: sending SIDEBAR_UPDATE_URL", tab.url);
        chrome.runtime.sendMessage({
            type: "SIDEBAR_UPDATE_URL",
            url: tab.url,
            title: tab.title,
            tabId: tabId
        });
    }
});

// Listen for tab activation (when user switches tabs)
chrome.tabs.onActivated.addListener(activeInfo => {
    chrome.tabs.get(activeInfo.tabId, (tab) => {
        console.log("background.js: sending SIDEBAR_UPDATE_URL (activated)", tab.url);
        chrome.runtime.sendMessage({
            type: "SIDEBAR_UPDATE_URL",
            url: tab.url,
            title: tab.title,
            tabId: tab.id
        });
    });
});