/**
 * Custom Sidebar for Chrome Extension
 * This file contains the implementation of a custom sidebar for the Chrome extension.
 * It includes message handling, DOM manipulation, and UI controls.
 */

// ----------------------------------------------------------------------------------
// Security Configuration
// ----------------------------------------------------------------------------------

// Get the trusted origin from the configured iframe source
function getTrustedOrigin() {
    const iframeSrc = getConfig('sidebar.iframeSrc');
    try {
        const url = new URL(iframeSrc);
        return url.origin;
    } catch (e) {
        return '';
    }
}

// ----------------------------------------------------------------------------------
// Configuration Management
// ----------------------------------------------------------------------------------

let extensionConfig = null;

// Load configuration from settings.json
async function loadExtensionConfig() {
    try {
        const configUrl = chrome.runtime.getURL('config/settings.json');
        const response = await fetch(configUrl);
        extensionConfig = await response.json();
        return extensionConfig;
    } catch (error) {
        console.error('Failed to load extension config, using defaults:', error);
        // Fallback to default configuration
        extensionConfig = {
            sidebar: {
                title: "Codelution Assistant",
                iframeSrc: "https://add-functions-codelution_chrome_extension.toddle.site/",
                defaultWidth: "400px",
                mobileWidthPercent: 85
            },
            styling: {
                primaryColor: "#1976d2",
                primaryColorHover: "#1565c0",
                backgroundColor: "#fff",
                textColor: "#333",
                shadowColor: "rgba(0,0,0,0.25)"
            },
            button: {
                tooltip: "Open Codelution Assistant",
                size: {
                    desktop: "50px",
                    mobile: "44px"
                },
                position: {
                    desktop: "20px",
                    mobile: "10px"
                }
            },
            behavior: {
                autoRestoreTimeMinutes: 5,
                enableResize: true,
                enableMobileOptimization: true,
                minWidth: 250,
                maxWidthPercent: 90
            }
        };
        return extensionConfig;
    }
}

// Get configuration value with fallback
function getConfig(path, fallback = null) {
    if (!extensionConfig) return fallback;
    
    const keys = path.split('.');
    let value = extensionConfig;
    
    for (const key of keys) {
        if (value && typeof value === 'object' && key in value) {
            value = value[key];
        } else {
            return fallback;
        }
    }
    
    return value;
}

// ----------------------------------------------------------------------------------
// Message Handling & Communication
// ----------------------------------------------------------------------------------

// Bridge: Capture window.postMessage and forward as chrome.runtime message
window.addEventListener('message', function(event) {
    // Security: Only process messages from trusted origins
    if (!event.data || typeof event.data !== 'object') return;
    
    // Check if the origin matches our configured iframe origin
    const trustedOrigin = getTrustedOrigin();
    if (event.origin !== trustedOrigin) {
        // Silently reject untrusted messages in production
        return;
    }
    
    // Check message types from Toddle/Nordcraft
    const type = event.data.type;
    
    if (type === 'injectWebComponent') {
        // Process directly in content.js
        const request = {
            type: 'manipulateDom',
            action: 'injectWebComponent',
            selector: event.data.selector,
            src: event.data.src,
            name: event.data.name,
            placement: event.data.placement
        };
        
        // Handle directly without chrome.runtime
        injectWebComponent(request);
    } else if (type === 'manipulate-dom') {
        // DOM manipulation
        const { selector, action, value } = event.data;
        handleDomManipulation(selector, action, value);
    } else if (type === 'start-dom-observer' || type === 'observe-dom-value') {
        // DOM observer
        const { selector, attribute, eventType, watchId } = event.data;
        handleDomObserver(selector, attribute, eventType, watchId);
    } else if (type === 'get-dom-info') {
        // Get DOM info
        const { selector, attribute, requestId } = event.data;
        handleGetDomInfo(selector, attribute, requestId);
    } else if (type === 'get-tab-info') {
        // Send tab info to iframe
        const iframe = document.getElementById('sidebar-container-nordcraft');
        if (iframe && iframe.contentWindow) {
            const trustedOrigin = getTrustedOrigin();
            iframe.contentWindow.postMessage({
                type: 'tab-info',
                data: {
                    url: window.location.href,
                    title: document.title,
                    tabId: 'tab-' + Date.now() // Generate an id for this tab
                }
            }, trustedOrigin);
        }
    }
});

// Handle messages from the extension background script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    // Handle DOM manipulation requests
    if (request.type === 'manipulateDom') {
        handleManipulateDomRequest(request);
    }
    // Handle data requests
    else if (request.type === 'getData') {
        const data = captureData();
        sendResponse(data);
    } 
    // Handle custom sidebar toggle
    else if (request.action === "showCustomSidebar") {
        toggleCustomSidebar();
    }
    // Handle sidebar state check from background script
    else if (request.action === "checkSidebarState") {
        const existingSidebar = document.getElementById('my-chrome-sidebar-wrapper');
        if (!existingSidebar) {
            // Sidebar doesn't exist, check if it should be restored
            chrome.storage.local.get(['sidebarOpen', 'lastStateChange'], (result) => {
                const fiveMinutesAgo = Date.now() - (5 * 60 * 1000);
                const wasRecentlyChanged = result.lastStateChange && result.lastStateChange > fiveMinutesAgo;
                
                if (result.sidebarOpen === true && wasRecentlyChanged) {
                    setTimeout(() => toggleCustomSidebar(), 100);
                } else if (result.sidebarOpen === true && !wasRecentlyChanged) {
                    saveSidebarState(false);
                }
            });
        }
    }
});

// ----------------------------------------------------------------------------------
// DOM Manipulation Functions
// ----------------------------------------------------------------------------------

// Handle DOM manipulation request from background script
function handleManipulateDomRequest(request) {
    if (request.action === 'removeElement') {
        const el = document.querySelector(request.selector);
        if (el) el.remove();
    } else if (request.action === 'observeDomValue') {
        // Start an observer on an element and send domValueChanged with watchId on change
        const selector = request.selector;
        const attribute = request.attribute || 'innerText';
        const eventType = request.eventType || (attribute === 'value' ? 'input' : 'DOMSubtreeModified');
        const watchId = request.watchId;
        const el = document.querySelector(selector);
        if (!el) return;
        
        let lastValue = (attribute in el) ? el[attribute] : el.getAttribute(attribute);
        // Send current value immediately
        chrome.runtime.sendMessage({
            type: 'domValueChanged',
            selector,
            attribute,
            value: lastValue,
            watchId
        });
        
        if (eventType !== 'DOMSubtreeModified') {
            el.addEventListener(eventType, () => {
                let value = (attribute in el) ? el[attribute] : el.getAttribute(attribute);
                if (value !== lastValue) {
                    lastValue = value;
                    chrome.runtime.sendMessage({
                        type: 'domValueChanged',
                        selector,
                        attribute,
                        value,
                        watchId
                    });
                }
            });
        } else {
            const observer = new MutationObserver(() => {
                let value = (attribute in el) ? el[attribute] : el.getAttribute(attribute);
                if (value !== lastValue) {
                    lastValue = value;
                    chrome.runtime.sendMessage({
                        type: 'domValueChanged',
                        selector,
                        attribute,
                        value,
                        watchId
                    });
                }
            });
            observer.observe(el, { childList: true, subtree: true, characterData: true });
        }
    } else if (request.action === 'injectWebComponent') {
        injectWebComponent(request);
    } else {
        performDomAction(request);
    }
}

// Perform standard DOM actions on elements
function performDomAction(request) {
    const el = document.querySelector(request.selector);
    if (!el) return;
    
    switch(request.action) {
        case 'setText':
            el.textContent = request.value;
            break;
        case 'setHTML':
            el.innerHTML = request.value;
            break;
        case 'setStyle':
            Object.assign(el.style, request.value);
            break;
        case 'addClass':
            el.classList.add(request.value);
            break;
        case 'removeClass':
            el.classList.remove(request.value);
            break;
        case 'toggleClass':
            el.classList.toggle(request.value);
            break;
        case 'appendHTML':
            el.insertAdjacentHTML('beforeend', request.value);
            break;
        case 'prependHTML':
            el.insertAdjacentHTML('afterbegin', request.value);
            break;
        case 'click':
            el.click();
            break;
        case 'setInputValue':
            // Fill input, textarea or select field
            if ('value' in el) {
                el.value = request.value;
                el.dispatchEvent(new Event('input', { bubbles: true }));
                el.dispatchEvent(new Event('change', { bubbles: true }));
            }
            break;
    }
}

// Inject a web component with flexible placement
function injectWebComponent(request) {
    const name = request.name;
    const scriptSrc = request.src;
    const selector = request.selector; // CSS selector
    const placement = request.placement || 'append'; // 'replace', 'append', 'prepend'
    
    if (!scriptSrc) {
        // Silent return - no scriptSrc provided
        return;
    }
    
    if (!name) {
        // Silent return - no name provided
        return;
    }
    
    // Function to create and place the custom element
    function createCustomElement() {
        // Check if customElements API is available
        if (typeof customElements === 'undefined' || !customElements) {
            // customElements API not available, creating element anyway
        } else {
            // Check if custom element is defined
            if (!customElements.get(name)) {
                // Retry after a longer delay
                setTimeout(createCustomElement, 500);
                return;
            }
        }
        
        const target = selector ? document.querySelector(selector) : null;
        
        if (!target) {
            // Fallback: bottom of body
            if (!document.body.querySelector(name)) {
                const customEl = document.createElement(name);
                
                // Create and add the script element inside the custom element
                const script = document.createElement('script');
                script.type = 'module';
                script.src = scriptSrc;
                customEl.appendChild(script);
                
                document.body.appendChild(customEl);
            }
            return;
        }
        
        // Prevent double injection
        if (target.querySelector(name) || (target.parentNode && target.parentNode.querySelector(name))) {
            return;
        }
        
        const customEl = document.createElement(name);
        
        // Create and add the script element inside the custom element
        const script = document.createElement('script');
        script.type = 'module';
        script.src = scriptSrc;
        customEl.appendChild(script);
        
        if (placement === 'replace') {
            target.replaceWith(customEl);
        } else if (placement === 'prepend') {
            target.insertBefore(customEl, target.firstChild);
        } else {
            // append (default)
            target.appendChild(customEl);
        }
    }
    
    // Check if script already exists (either as standalone or inside custom element)
    const existingScript = document.querySelector(`script[src="${scriptSrc}"]`);
    const existingCustomEl = document.querySelector(name);
    
    if (existingScript || existingCustomEl) {
        // If custom element exists but no script inside, add script
        if (existingCustomEl && !existingCustomEl.querySelector(`script[src="${scriptSrc}"]`)) {
            const script = document.createElement('script');
            script.type = 'module';
            script.src = scriptSrc;
            existingCustomEl.appendChild(script);
        }
        return;
    }
    
    // Create custom element with script inside (no separate script loading needed)
    createCustomElement();
}

// Handle direct DOM manipulation
function handleDomManipulation(selector, action, value) {
    const el = document.querySelector(selector);
    if (!el) {
        return;
    }
    
    switch(action) {
        case 'removeElement':
            el.remove();
            break;
        case 'setText':
            el.textContent = value;
            break;
        case 'setHTML':
            el.innerHTML = value;
            break;
        case 'setStyle':
            Object.assign(el.style, value);
            break;
        case 'addClass':
            el.classList.add(value);
            break;
        case 'removeClass':
            el.classList.remove(value);
            break;
        case 'toggleClass':
            el.classList.toggle(value);
            break;
        case 'click':
            el.click();
            break;
        case 'setInputValue':
            if ('value' in el) {
                el.value = value;
                el.dispatchEvent(new Event('input', { bubbles: true }));
                el.dispatchEvent(new Event('change', { bubbles: true }));
            }
            break;
    }
}

// Handler for DOM observer
function handleDomObserver(selector, attribute, eventType, watchId) {
    const el = document.querySelector(selector);
    
    // Return early if element not found
    if (!el) {
        return;
    }
    
    attribute = attribute || 'innerText';
    eventType = eventType || (attribute === 'value' ? 'input' : 'DOMSubtreeModified');
    
    let lastValue = (attribute in el) ? el[attribute] : el.getAttribute(attribute);
    
    // Send current value directly back to iframe
    const iframe = document.getElementById('sidebar-container-nordcraft');
    if (iframe && iframe.contentWindow) {
        const trustedOrigin = getTrustedOrigin();
        iframe.contentWindow.postMessage({
            type: 'domValueChanged',
            selector,
            attribute,
            value: lastValue,
            watchId
        }, trustedOrigin);
    }
    
    // Set up the observer
    if (eventType !== 'DOMSubtreeModified') {
        el.addEventListener(eventType, () => {
            let value = (attribute in el) ? el[attribute] : el.getAttribute(attribute);
            if (value !== lastValue) {
                lastValue = value;
                if (iframe && iframe.contentWindow) {
                    const trustedOrigin = getTrustedOrigin();
                    iframe.contentWindow.postMessage({
                        type: 'domValueChanged',
                        selector,
                        attribute,
                        value,
                        watchId
                    }, trustedOrigin);
                }
            }
        });
    } else {
        const observer = new MutationObserver(() => {
            let value = (attribute in el) ? el[attribute] : el.getAttribute(attribute);
            if (value !== lastValue) {
                lastValue = value;
                if (iframe && iframe.contentWindow) {
                    const trustedOrigin = getTrustedOrigin();
                    iframe.contentWindow.postMessage({
                        type: 'domValueChanged',
                        selector,
                        attribute,
                        value,
                        watchId
                    }, trustedOrigin);
                }
            }
        });
        observer.observe(el, { childList: true, subtree: true, characterData: true });
    }
}

// Handler for getting DOM info
function handleGetDomInfo(selector, attribute, requestId) {
    const el = document.querySelector(selector);
    let value = null;
    
    if (el) {
        value = (attribute in el) ? el[attribute] : el.getAttribute(attribute);
    }
    
    // Send result back to iframe
    const iframe = document.getElementById('sidebar-container-nordcraft');
    if (iframe && iframe.contentWindow) {
        const trustedOrigin = getTrustedOrigin();
        iframe.contentWindow.postMessage({
            type: 'dom-info-result',
            selector,
            attribute,
            value,
            requestId
        }, trustedOrigin);
    }
}

// Function to capture data from the current webpage
function captureData() {
    const pageData = {
        title: document.title,
        url: window.location.href,
        content: document.body.innerText,
    };
    return pageData;
}

// Function to overwrite website text or HTML
function overwriteContent(newContent) {
    document.body.innerHTML = newContent;
}

// Function to capture a screenshot of the current webpage
function captureScreenshot() {
    html2canvas(document.body).then(canvas => {
        const screenshot = canvas.toDataURL();
        // Send the screenshot to the background script or popup
        chrome.runtime.sendMessage({ type: 'screenshot', data: screenshot });
    });
}


// ----------------------------------------------------------------------------------
// URL Change Detection for Single Page Applications
// ----------------------------------------------------------------------------------

let currentUrl = window.location.href;

// Function to send URL change notification
function notifyUrlChange(newUrl, oldUrl) {
    // Notify background script
    chrome.runtime.sendMessage({
        type: "NORDCRAFT_ACTION",
        action: "URL_CHANGED",
        newUrl: newUrl,
        oldUrl: oldUrl,
        title: document.title
    });
    
    // Notify iframe if it exists - send both url-changed AND tab-info events
    const iframe = document.getElementById('sidebar-container-nordcraft');
    if (iframe && iframe.contentWindow) {
        const trustedOrigin = getTrustedOrigin();
        
        // Send specific URL change event
        iframe.contentWindow.postMessage({
            type: 'url-changed',
            data: {
                newUrl: newUrl,
                oldUrl: oldUrl,
                title: document.title,
                tabId: 'tab-' + Date.now()
            }
        }, trustedOrigin);
        
        // Also send tab-info event (same as existing listeners expect)
        iframe.contentWindow.postMessage({
            type: 'tab-info',
            data: {
                url: newUrl,
                title: document.title,
                tabId: 'tab-' + Date.now(),
                changeType: 'spa_navigation' // Extra info to distinguish from initial load
            }
        }, trustedOrigin);
    }
}

// Override pushState and replaceState to detect programmatic navigation
function setupHistoryListener() {
    const originalPushState = history.pushState;
    const originalReplaceState = history.replaceState;
    
    history.pushState = function(...args) {
        const oldUrl = currentUrl;
        originalPushState.apply(history, args);
        const newUrl = window.location.href;
        
        if (newUrl !== oldUrl) {
            currentUrl = newUrl;
            notifyUrlChange(newUrl, oldUrl);
        }
    };
    
    history.replaceState = function(...args) {
        const oldUrl = currentUrl;
        originalReplaceState.apply(history, args);
        const newUrl = window.location.href;
        
        if (newUrl !== oldUrl) {
            currentUrl = newUrl;
            notifyUrlChange(newUrl, oldUrl);
        }
    };
}

// Listen for browser navigation events (back/forward buttons)
function setupPopstateListener() {
    window.addEventListener('popstate', function(event) {
        const oldUrl = currentUrl;
        const newUrl = window.location.href;
        
        if (newUrl !== oldUrl) {
            currentUrl = newUrl;
            notifyUrlChange(newUrl, oldUrl);
        }
    });
}

// Additional fallback: periodically check URL changes (for edge cases)
function setupUrlPolling() {
    setInterval(() => {
        const newUrl = window.location.href;
        if (newUrl !== currentUrl) {
            const oldUrl = currentUrl;
            currentUrl = newUrl;
            notifyUrlChange(newUrl, oldUrl);
        }
    }, 1000); // Check every second
}

// Watch for title changes as additional SPA navigation indicator
function setupTitleObserver() {
    let currentTitle = document.title;
    
    // Use MutationObserver to watch for title changes
    const titleObserver = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
            if (mutation.type === 'childList' && mutation.target.nodeName === 'TITLE') {
                const newTitle = document.title;
                if (newTitle !== currentTitle) {
                    currentTitle = newTitle;
                    // Title changed - likely indicates navigation, double-check URL
                    setTimeout(() => {
                        const newUrl = window.location.href;
                        if (newUrl !== currentUrl) {
                            const oldUrl = currentUrl;
                            currentUrl = newUrl;
                            notifyUrlChange(newUrl, oldUrl);
                        }
                    }, 100);
                }
            }
        });
    });
    
    // Observe the head element for title changes
    const headElement = document.querySelector('head');
    if (headElement) {
        titleObserver.observe(headElement, {
            childList: true,
            subtree: true
        });
    }
}

// Initialize URL change detection
function initializeUrlDetection() {
    setupHistoryListener();
    setupPopstateListener();
    setupUrlPolling();
    setupTitleObserver();
}

// ----------------------------------------------------------------------------------
// Custom Sidebar Implementation
// ----------------------------------------------------------------------------------

// Initialize the extension by notifying the background script about the current URL
chrome.runtime.sendMessage({
  type: "NORDCRAFT_ACTION",
  action: "READ_URL",
  url: window.location.href
});

function addSidebarToggleButton() {
    if (document.getElementById('my-chrome-sidebar-btn')) return; 

    const btn = document.createElement('button');
    btn.id = 'my-chrome-sidebar-btn';
    btn.title = getConfig('button.tooltip', 'Open assistant');
    
    // Icon SVG
    btn.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="3" y1="12" x2="21" y2="12"></line>
            <line x1="3" y1="6" x2="21" y2="6"></line>
            <line x1="3" y1="18" x2="21" y2="18"></line>
        </svg>
    `;
    
    // Get responsive sizes from config
    const isMobile = window.innerWidth < 768;
    const buttonSize = isMobile ? 
        getConfig('button.size.mobile', '44px') : 
        getConfig('button.size.desktop', '50px');
    const buttonRight = isMobile ? 
        getConfig('button.position.mobile', '10px') : 
        getConfig('button.position.desktop', '20px');
    
    // Get colors from config
    const primaryColor = getConfig('styling.primaryColor', '#1976d2');
    const primaryColorHover = getConfig('styling.primaryColorHover', '#1565c0');
    const shadowColor = getConfig('styling.shadowColor', 'rgba(0,0,0,0.25)');
    
    Object.assign(btn.style, {
        position: 'fixed',
        top: '50%', 
        right: buttonRight,
        transform: 'translateY(-50%)', 
        zIndex: '99999',
        width: buttonSize,
        height: buttonSize,
        padding: '0',
        borderRadius: '50%',
        border: 'none',
        background: primaryColor,
        color: '#fff',
        boxShadow: `0 3px 12px ${shadowColor}`,
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        transition: 'all 0.3s ease',
        outline: 'none'
    });

    // Enhanced hover effects with config colors
    btn.onmouseover = () => {
        btn.style.background = primaryColorHover;
        btn.style.boxShadow = `0 5px 15px ${shadowColor.replace('0.25', '0.35')}`;
        btn.style.transform = 'translateY(-50%) scale(1.08)';
    };
    
    btn.onmouseout = () => {
        btn.style.background = primaryColor;
        btn.style.boxShadow = `0 3px 12px ${shadowColor}`;
        btn.style.transform = 'translateY(-50%) scale(1)';
    };

    // Active state for touch devices
    btn.ontouchstart = () => {
        btn.style.background = primaryColorHover;
        btn.style.transform = 'translateY(-50%) scale(0.95)';
    };
    
    btn.ontouchend = () => {
        btn.style.background = primaryColor;
        btn.style.transform = 'translateY(-50%) scale(1)';
        setTimeout(() => toggleCustomSidebar(), 50);
    };

    btn.onclick = () => {
        toggleCustomSidebar();
    };

    // Add event listener for window resize to adjust position
    if (getConfig('behavior.enableMobileOptimization', true)) {
        window.addEventListener('resize', () => {
            const newIsMobile = window.innerWidth < 768;
            const newButtonSize = newIsMobile ? 
                getConfig('button.size.mobile', '44px') : 
                getConfig('button.size.desktop', '50px');
            const newButtonRight = newIsMobile ? 
                getConfig('button.position.mobile', '10px') : 
                getConfig('button.position.desktop', '20px');
            
            btn.style.width = newButtonSize;
            btn.style.height = newButtonSize;
            btn.style.right = newButtonRight;
        });
    }

    document.body.appendChild(btn);
}

// Inject and manage custom sidebar with improved mobile support
function injectCustomSidebar() {
    if (document.getElementById('my-chrome-sidebar')) return; // Prevent duplicate sidebar
    
    // Get configuration values
    const defaultWidth = getConfig('sidebar.defaultWidth', '400px');
    const mobileWidthPercent = getConfig('sidebar.mobileWidthPercent', 85);
    const enableMobileOptimization = getConfig('behavior.enableMobileOptimization', true);
    const backgroundColor = getConfig('styling.backgroundColor', '#fff');
    const primaryColor = getConfig('styling.primaryColor', '#1976d2');
    const shadowColor = getConfig('styling.shadowColor', 'rgba(0,0,0,0.25)');
    
    // Determine a good default width based on screen size and config
    let calculatedWidth = defaultWidth;
    if (enableMobileOptimization && window.innerWidth < 768) {
        calculatedWidth = (window.innerWidth * (mobileWidthPercent / 100)) + 'px';
    }
    
    // Create wrapper for the entire sidebar
    const sidebarWrapper = document.createElement('div');
    sidebarWrapper.id = 'my-chrome-sidebar-wrapper';
    Object.assign(sidebarWrapper.style, {
        position: 'fixed',
        top: '0',
        right: '-' + calculatedWidth, // Start hidden
        width: calculatedWidth,
        height: '100vh',
        zIndex: '999999',
        transition: 'right 0.3s ease',
        display: 'flex',
        overflow: 'hidden',
        maxWidth: '95vw', // Never wider than the screen
        boxShadow: `-5px 0 25px ${shadowColor}` // Use config shadow color
    });
    
    // Create resize handle if enabled
    let resizeHandle = null;
    if (getConfig('behavior.enableResize', true)) {
        resizeHandle = document.createElement('div');
        resizeHandle.id = 'my-chrome-sidebar-resize';
        Object.assign(resizeHandle.style, {
            width: '20px',
            position: 'absolute',
            left: '-10px',
            top: '0',
            bottom: '0',
            cursor: 'col-resize',
            background: 'transparent',
            zIndex: '1000000'
        });
        
        // Visual indicator for resize handle
        const resizeIndicator = document.createElement('div');
        Object.assign(resizeIndicator.style, {
            position: 'absolute',
            left: '9px',
            top: '0',
            bottom: '0',
            width: '2px',
            background: '#e0e0e0',
            opacity: '0.3',
            borderRadius: '1px',
            transition: 'opacity 0.2s, background 0.2s, width 0.2s',
            height: '100%'
        });
        resizeHandle.appendChild(resizeIndicator);
    }
    
    // Create the sidebar container
    const sidebar = document.createElement('div');
    sidebar.id = 'my-chrome-sidebar';
    Object.assign(sidebar.style, {
        width: '100%',
        background: backgroundColor,
        boxShadow: `-2px 0 5px ${shadowColor}`,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        borderTopLeftRadius: '8px',
        borderBottomLeftRadius: '8px' 
    });

    // Header with close button and responsive title
    const header = document.createElement('div');
    Object.assign(header.style, {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '12px 16px',
        borderBottom: '1px solid rgba(0,0,0,0.1)',
        background: primaryColor,
        color: '#fff'
    });
    
    // Title in header from config
    const title = document.createElement('div');
    title.textContent = getConfig('sidebar.title', 'Custom Sidebar');
    Object.assign(title.style, {
        fontWeight: '600',
        fontSize: '16px',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
        overflow: 'hidden'
    });
    header.appendChild(title);

    // Close button with config colors
    const closeBtn = document.createElement('button');
    closeBtn.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
        </svg>
    `;
    Object.assign(closeBtn.style, {
        background: 'none',
        border: 'none',
        cursor: 'pointer',
        color: '#fff',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '6px',
        borderRadius: '4px',
        transition: 'background 0.2s, transform 0.2s',
        marginLeft: '10px'
    });
    
    closeBtn.onmouseover = () => {
        closeBtn.style.background = 'rgba(255, 255, 255, 0.2)';
        closeBtn.style.transform = 'scale(1.1)';
    };
    
    closeBtn.onmouseout = () => {
        closeBtn.style.background = 'none';
        closeBtn.style.transform = 'scale(1)';
    };
    
    closeBtn.onclick = () => {
        sidebarWrapper.style.right = '-' + sidebarWrapper.style.width;
        // Show toggle button again
        const toggleBtn = document.getElementById('my-chrome-sidebar-btn');
        if (toggleBtn) toggleBtn.style.display = 'flex';
        // Save the closed state
        saveSidebarState(false);
    };
    header.appendChild(closeBtn);

    // Create iframe with the sidebar content from config
    const iframe = document.createElement('iframe');
    iframe.id = 'sidebar-container-nordcraft';
    Object.assign(iframe.style, {
        flex: '1',
        width: '100%',
        height: '100%',
        border: 'none'
    });
    
    // Use iframe source from config
    iframe.src = getConfig('sidebar.iframeSrc', 'https://add-functions-codelution_chrome_extension.toddle.site/');
    
    // Assemble everything
    sidebar.appendChild(header);
    sidebar.appendChild(iframe);
    sidebarWrapper.appendChild(sidebar);
    
    // Add resize handle if enabled
    if (resizeHandle) {
        sidebarWrapper.appendChild(resizeHandle);
    }
    
    document.body.appendChild(sidebarWrapper);
    
    // Add resize functionality if enabled
    if (getConfig('behavior.enableResize', true) && resizeHandle) {
        setupResizeHandle(sidebarWrapper, resizeHandle);
    }
    
    // Ensure responsiveness on window resize
    if (enableMobileOptimization) {
        window.addEventListener('resize', function() {
            // If sidebar is fully hidden, adjust width for next time shown
            if (sidebarWrapper.style.right !== '0px') {
                let newWidth = getConfig('sidebar.defaultWidth', '400px');
                if (window.innerWidth < 768) {
                    // On smaller screens, use configured mobile width percent
                    newWidth = (window.innerWidth * (mobileWidthPercent / 100)) + 'px';
                }
                sidebarWrapper.style.width = newWidth;
            }
            
            // Ensure sidebar is never wider than the screen
            const maxWidthPercent = getConfig('behavior.maxWidthPercent', 90);
            const maxWidth = window.innerWidth * (maxWidthPercent / 100);
            if (parseInt(sidebarWrapper.style.width) > maxWidth) {
                sidebarWrapper.style.width = maxWidth + 'px';
            }
        });
    }
    
    // Ensure the iframe knows the sidebar is ready
    iframe.onload = () => {
        chrome.runtime.sendMessage({
            type: "SIDEBAR_READY",
            url: window.location.href,
            title: document.title
        });
        
        // Send tab info to iframe
        const trustedOrigin = getTrustedOrigin();
        iframe.contentWindow.postMessage({
            type: 'tab-info',
            data: {
                url: window.location.href,
                title: document.title,
                tabId: 'tab-' + Date.now()
            }
        }, trustedOrigin);
    };
    
    return sidebarWrapper;
}

// Enhanced resize functionality without external libraries
function setupResizeHandle(wrapper, handle) {
    let startX, startWidth, initialWidth, dragging = false;
    
    // Get configuration values
    let minWidth = getConfig('behavior.minWidth', 250);
    let maxWidthPercent = getConfig('behavior.maxWidthPercent', 90);
    let maxWidth = window.innerWidth * (maxWidthPercent / 100);
    const primaryColor = getConfig('styling.primaryColor', '#1976d2');
    
    // Update maxWidth on window resize
    window.addEventListener('resize', function() {
        maxWidth = window.innerWidth * (maxWidthPercent / 100);
        // If sidebar is wider than new maxWidth, adjust
        if (wrapper.offsetWidth > maxWidth) {
            wrapper.style.width = `${maxWidth}px`;
        }
    });
    
    // Enhanced visibility of the resize handle
    wrapper.addEventListener('mouseenter', function() {
        const indicator = handle.querySelector('div');
        if (indicator) {
            indicator.style.display = 'block';
            indicator.style.opacity = '0.8';
        }
    });
    
    wrapper.addEventListener('mouseleave', function() {
        // Only hide if not dragging
        if (!dragging) {
            const indicator = handle.querySelector('div');
            if (indicator) {
                indicator.style.opacity = '0.3';
                if (!handle.matches(':hover')) {
                    indicator.style.display = 'none';
                }
            }
        }
    });
    
    // Clearer hover state for handle with config color
    handle.addEventListener('mouseenter', function() {
        const indicator = handle.querySelector('div');
        if (indicator) {
            indicator.style.display = 'block';
            indicator.style.opacity = '1';
            indicator.style.background = primaryColor;
            indicator.style.width = '4px';  // Make slightly thicker on hover
        }
        handle.style.cursor = 'col-resize';
    });
    
    handle.addEventListener('mouseleave', function() {
        if (!dragging) {
            const indicator = handle.querySelector('div');
            if (indicator) {
                if (!wrapper.matches(':hover')) {
                    indicator.style.display = 'none';
                } else {
                    indicator.style.opacity = '0.5';
                    indicator.style.background = '#e0e0e0';
                    indicator.style.width = '2px';
                }
            }
        }
    });
    
    // Start resize
    handle.addEventListener('mousedown', function(e) {
        e.preventDefault();
        e.stopPropagation();
        
        dragging = true;
        startX = e.clientX;
        initialWidth = wrapper.offsetWidth;
        startWidth = initialWidth;
        
        // Add a CSS class for visual feedback
        document.body.classList.add('sidebar-resizing');
        
        // Enhanced visual feedback
        document.documentElement.style.cursor = 'col-resize';
        
        const indicator = handle.querySelector('div');
        if (indicator) {
            indicator.style.display = 'block';
            indicator.style.background = primaryColor;
            indicator.style.opacity = '1';
            indicator.style.width = '4px';
        }
        
        // Add an overlay that prevents mouse events from going to other elements
        let overlay = document.createElement('div');
        overlay.id = 'sidebar-resize-overlay';
        overlay.style.position = 'fixed';
        overlay.style.top = '0';
        overlay.style.left = '0';
        overlay.style.width = '100vw';
        overlay.style.height = '100vh';
        overlay.style.zIndex = '9999999';
        overlay.style.cursor = 'col-resize';
        overlay.style.backgroundColor = 'transparent';
        document.body.appendChild(overlay);
        
        // Prevent selection during resize
        document.body.style.userSelect = 'none';
        document.body.style.pointerEvents = 'none';
        
        // Bind functions with correct context
        const boundResizeMove = resizeMove.bind(this);
        const boundResizeStop = resizeStop.bind(this);
        
        document.addEventListener('mousemove', boundResizeMove);
        document.addEventListener('mouseup', function(e) {
            boundResizeStop(e);
            document.removeEventListener('mousemove', boundResizeMove);
            document.removeEventListener('mouseup', boundResizeStop);
        });
    });
    
    function resizeMove(e) {
        if (!dragging) return;
        
        // Calculate the new width (negative delta = to the right = smaller)
        let delta = startX - e.clientX;
        let newWidth = Math.max(minWidth, Math.min(maxWidth, startWidth + delta));
        
        // Apply the width directly using requestAnimationFrame for smoother animation
        requestAnimationFrame(() => {
            wrapper.style.width = `${newWidth}px`;
        });
    }
    
    function resizeStop(e) {
        dragging = false;
        document.body.classList.remove('sidebar-resizing');
        document.documentElement.style.cursor = '';
        document.body.style.userSelect = '';
        document.body.style.pointerEvents = '';
        
        // Remove overlay
        const overlay = document.getElementById('sidebar-resize-overlay');
        if (overlay) overlay.remove();
        
        // Reset indicator style
        const indicator = handle.querySelector('div');
        if (indicator) {
            indicator.style.background = '#e0e0e0';
            indicator.style.width = '2px';
            
            // Only show indicator if mouse is still over handle or wrapper
            if (!handle.matches(':hover') && !wrapper.matches(':hover')) {
                indicator.style.display = 'none';
                indicator.style.opacity = '0.3';
            } else if (handle.matches(':hover')) {
                indicator.style.opacity = '1';
                indicator.style.background = '#1976d2';
            } else {
                indicator.style.opacity = '0.5';
            }
        }
    }
}

// Toggle the sidebar visibility
function toggleCustomSidebar() {
    let sidebarWrapper = document.getElementById('my-chrome-sidebar-wrapper');
    const toggleBtn = document.getElementById('my-chrome-sidebar-btn');
    
    if (!sidebarWrapper) {
        sidebarWrapper = injectCustomSidebar();
        // Short delay to ensure correct initialization
        setTimeout(() => {
            sidebarWrapper.style.right = '0';
            if (toggleBtn) toggleBtn.style.display = 'none';
            // Save the opened state
            saveSidebarState(true);
        }, 50);
        return;
    }
    
    // Get the current width
    const currentWidth = sidebarWrapper.offsetWidth || 400;
    const isVisible = sidebarWrapper.style.right === '0px';
    
    if (isVisible) {
        // Hide the sidebar
        sidebarWrapper.style.right = `-${currentWidth}px`;
        if (toggleBtn) toggleBtn.style.display = 'flex';
        saveSidebarState(false);
    } else {
        // Show the sidebar
        sidebarWrapper.style.right = '0';
        if (toggleBtn) toggleBtn.style.display = 'none';
        saveSidebarState(true);
    }
}

// Save sidebar state to Chrome storage
function saveSidebarState(isOpen) {
    chrome.storage.local.set({ 
        sidebarOpen: isOpen,
        sidebarUrl: window.location.href,
        lastStateChange: Date.now() // Track when state was last changed
    });
}

// Restore sidebar state from Chrome storage
function restoreSidebarState() {
    chrome.storage.local.get(['sidebarOpen', 'lastStateChange'], (result) => {
        // Get auto-restore time from config (in minutes)
        const autoRestoreMinutes = getConfig('behavior.autoRestoreTimeMinutes', 5);
        const autoRestoreTime = Date.now() - (autoRestoreMinutes * 60 * 1000);
        const wasRecentlyChanged = result.lastStateChange && result.lastStateChange > autoRestoreTime;
        
        if (result.sidebarOpen === true && wasRecentlyChanged) {
            // Restore the sidebar in open state with a small delay
            setTimeout(() => {
                const existingSidebar = document.getElementById('my-chrome-sidebar-wrapper');
                if (!existingSidebar) {
                    toggleCustomSidebar();
                }
            }, 250); // Slightly longer delay to ensure DOM is fully ready
        } else if (result.sidebarOpen === true && !wasRecentlyChanged) {
            // Reset the state to closed since it's old
            saveSidebarState(false);
        }
    });
}

// Check if we should auto-restore sidebar on page load
function checkAndRestoreSidebar() {
    // Add a short delay to ensure the page has fully loaded
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            setTimeout(restoreSidebarState, 100);
        });
    } else {
        setTimeout(restoreSidebarState, 100);
    }
}

// Initialize the sidebar toggle button and restore state
async function initializeExtension() {
    // Load configuration first
    await loadExtensionConfig();
    
    // Initialize URL change detection for SPAs
    initializeUrlDetection();
    
    // Then initialize sidebar functionality
    addSidebarToggleButton();
    checkAndRestoreSidebar();
}

// Start initialization
initializeExtension();