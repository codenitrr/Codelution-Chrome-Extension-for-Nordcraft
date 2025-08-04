/**
 * Sidebar Script
 * 
 * Handles communication between the extension's iframe content, content script,
 * and background script to facilitate DOM manipulation and data exchange.
 */

document.addEventListener('DOMContentLoaded', () => {
    chrome.runtime.sendMessage({ action: "openSidebar" });

    // MESSAGE HANDLERS FOR IFRAME REQUESTS
    
    // Listen for DOM manipulation requests from the iframe
    window.addEventListener('message', (event) => {
      if (event.data && event.data.type === 'manipulate-dom') {
        const { selector, action, value } = event.data;
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
          if (tabs[0]) {
            chrome.tabs.sendMessage(tabs[0].id, {
              type: 'manipulateDom',
              selector,
              action,
              value
            });
          }
        });
      }
    });

    // Listen for web component injection requests from the iframe
    window.addEventListener('message', (event) => {
      if (event.data && event.data.type === 'injectWebComponent') {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
          if (tabs[0]) {
            chrome.tabs.sendMessage(tabs[0].id, {
              type: 'manipulateDom',
              action: 'injectWebComponent',
              selector: event.data.selector,
              src: event.data.src,
              name: event.data.name,
              placement: event.data.placement
            });
          }
        });
      }
    });

    // Listen for tab info requests from the iframe
    window.addEventListener('message', (event) => {
      if (event.data && event.data.type === 'get-tab-info') {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
          if (tabs[0]) {
            const tab = tabs[0];
            const iframe = document.querySelector('iframe');
            if (iframe) {
              iframe.contentWindow.postMessage({
                type: 'tab-info',
                data: {
                  url: tab.url,
                  title: tab.title,
                  tabId: tab.id
                }
              }, '*');
            }
          }
        });
      }
    });

    // DOM OBSERVER FUNCTIONALITY
    
    // Handle DOM observer requests from the iframe
    window.addEventListener('message', (event) => {
      if (event.data && event.data.type === 'start-dom-observer') {
        const { selector, attribute, eventType, watchId } = event.data;
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
          if (tabs[0]) {
            chrome.tabs.sendMessage(
              tabs[0].id,
              {
                type: 'manipulateDom',
                action: 'observeDomValue',
                selector,
                attribute,
                eventType,
                watchId
              }
            );
          }
        });
      }
    });

    // Relay DOM value changes from content script to iframe
    chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
      if (msg.type === 'domValueChanged' && msg.watchId) {
        const iframe = document.getElementById('sidebar-container-nordcraft');
        if (iframe && iframe.contentWindow) {
          iframe.contentWindow.postMessage({
            type: 'domValueChanged',
            selector: msg.selector,
            attribute: msg.attribute,
            value: msg.value,
            watchId: msg.watchId
          }, '*');
        }
      }
    });

    // Handle DOM info requests from the iframe
    window.addEventListener('message', (event) => {
      if (event.data && event.data.type === 'get-dom-info') {
        const { selector, attribute, requestId } = event.data;
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
          if (tabs[0]) {
            chrome.tabs.sendMessage(
              tabs[0].id,
              {
                type: 'manipulateDom',
                action: 'getDomInfo',
                selector,
                attribute
              },
              (response) => {
                // Send the result back to the iframe
                const iframe = document.getElementById('sidebar-container-nordcraft');
                if (iframe && iframe.contentWindow) {
                  iframe.contentWindow.postMessage({
                    type: 'dom-info-result',
                    selector,
                    attribute,
                    value: response ? response.value : null,
                    requestId
                  }, '*');
                }
              }
            );
          }
        });
      }
    });

  
    
    // Listen for URL updates from background script
    chrome.runtime.onMessage.addListener((msg) => {
      console.log("sidebar.js: received message", msg);
      if (msg.type === "SIDEBAR_UPDATE_URL") {
        postToIframe(msg);
      }
    });
    
    // Listen for DOM observation requests from iframe
    window.addEventListener('message', (event) => {
      if (event.data && event.data.type === 'observe-dom-value') {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
          if (tabs[0]) {
            chrome.tabs.sendMessage(tabs[0].id, {
              type: 'manipulateDom',
              action: 'observeDomValue',
              selector: event.data.selector,
              attribute: event.data.attribute,
              eventType: event.data.eventType,
              iframeSelector: event.data.iframeSelector
            });
          }
        });
      }
    });

    // Notify background script that sidebar is ready
    chrome.runtime.sendMessage({ type: "SIDEBAR_READY" });
});