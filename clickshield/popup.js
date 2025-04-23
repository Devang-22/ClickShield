document.getElementById("scanButton").addEventListener("click", () => {
    document.getElementById("status").innerText = "Scanning...";
    
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        chrome.scripting.executeScript({
            target: { tabId: tabs[0].id },
            function: extractLinksAndClickables
        }, (results) => {
            if (chrome.runtime.lastError) {
                console.error("Script execution error:", chrome.runtime.lastError);
                document.getElementById("status").innerText = "Error extracting links.";
                return;
            }

            let extractedData = results[0].result;

            // Send extracted links to background.js
            chrome.runtime.sendMessage({ action: "sendData", data: extractedData }, (response) => {
                if (chrome.runtime.lastError) {
                    console.error("Message passing error:", chrome.runtime.lastError);
                    document.getElementById("status").innerText = "Error sending request.";
                    return;
                }

                if (response && response.status === "success") {
                    displayResults(response.results);
                    storeScanResults(response.results);  // Store scan results in local cache
                } else {
                    document.getElementById("status").innerText = "Error fetching scan results.";
                }
            });
        });
    });
});

// Function to manually check a URL
document.getElementById("searchButton").addEventListener("click", () => {
    let urlToCheck = document.getElementById("searchInput").value.trim();

    if (!urlToCheck) {
        alert("Please enter a URL.");
        return;
    }

    let apiUrl = `http://127.0.0.1:8000/check-link/?url=${encodeURIComponent(urlToCheck)}`;

    fetch(apiUrl)
        .then(response => response.json())
        .then(data => {
            displayManualCheckResults(data);
            storeManualCheckResult(urlToCheck, data);  // Store manual check result in local cache
        })
        .catch(error => {
            console.error("Error checking URL:", error);
            document.getElementById("manual-check-results").innerHTML = "<p style='color: red;'>Failed to fetch results. Please try again.</p>";
        });
});

// Function to extract links
function extractLinksAndClickables() {
    let elements = document.querySelectorAll("a, button, input[type=submit], [onclick]");
    let extractedData = [];

    elements.forEach(element => {
        let link = element.href || element.getAttribute("onclick") || "No direct link";
        extractedData.push({
            text: element.innerText || "No Text",
            link: link
        });
    });

    return extractedData;
}

// Function to store automatic scan results in local storage
function storeScanResults(results) {
    chrome.storage.local.set({ autoScanResults: results }, () => {
        console.log("Automatic scan results cached successfully.");
    });
}

// Function to store manual check results in local storage
function storeManualCheckResult(url, data) {
    chrome.storage.local.get("manualCheckResults", (result) => {
        let storedResults = result.manualCheckResults || {};
        storedResults[url] = data;  // Store result with the URL as the key

        chrome.storage.local.set({ manualCheckResults: storedResults }, () => {
            console.log(`Manual check result for ${url} cached successfully.`);
        });
    });
}

// Function to display scan results
function displayResults(results) {
    document.getElementById("status").innerText = "Scan Completed";
    console.log(results);

    // Display Summary Section
    if (results.Summary) {
        let summarySection = document.getElementById("stats-container");
        summarySection.innerHTML = `
            <h4>Scan Summary</h4>
            <p><strong>Total Links:</strong> ${results.Summary["Total Links"]}</p>
            <p><strong>Safe Count:</strong> ${results.Summary["Safe Count"]}</p>
            <p><strong>Undetected Count:</strong> ${results.Summary["Undetected Count"]}</p>
            <p><strong>Malicious Count:</strong> ${results.Summary["Malicious Count"]}</p>
            <hr>
        `;
    }

    // Clear previous lists before adding new ones
    document.getElementById("safe-links").innerHTML = '';
    document.getElementById("undetected-links").innerHTML = '';
    document.getElementById("malicious-links").innerHTML = '';

    // Categorize and Display Links in their respective sections
    ["Safe", "Undetected", "Malicious"].forEach(category => {
        if (results[category].length > 0) {
            let container = document.getElementById(`${category.toLowerCase()}-links`);
            results[category].forEach(item => {
                let listItem = document.createElement("li");
                listItem.innerHTML = `<a href="${item.URL}" target="_blank">${item.URL}</a>`;
                container.appendChild(listItem);
            });
        }
    });
}

// Function to display manual check results
function displayManualCheckResults(data) {
    let resultsContainer = document.getElementById("manual-check-results");
    resultsContainer.innerHTML = "";

    if (data.status === "error") {
        resultsContainer.innerHTML = `<p style="color: red;">${data.message}</p>`;
        return;
    }

    let reportHtml = `
        <div class="link-category-container">
            <h4>Manual Check Report</h4>
            <p><strong>URL:</strong> ${data.URL}</p>
            <p><strong>Threat Level:</strong> <span class="${data.threat_level.toLowerCase()}">${data.threat_level}</span></p>
            <p><strong>Malicious Count:</strong> ${data["Malicious Count"]}</p>
            <p><strong>Harmless Count:</strong> ${data["Harmless Count"]}</p>
            <p><strong>Undetected Count:</strong> ${data["Undetected Count"]}</p>
            <p><strong>User Votes (Malicious):</strong> ${data["User Votes Malicious"]}</p>
            <p><strong>User Votes (Harmless):</strong> ${data["User Votes Harmless"]}</p>
            <p><strong>Reputation Score:</strong> ${data["Reputation Score"]}</p>
        </div>
    `;

    resultsContainer.innerHTML = reportHtml;
}

// Load cached scan results when the popup opens
document.addEventListener("DOMContentLoaded", () => {
    chrome.storage.local.get("autoScanResults", (data) => {
        if (data.autoScanResults) {
            console.log("Loaded cached automatic scan results:", data.autoScanResults);
            displayResults(data.autoScanResults);
        } else {
            document.getElementById("status").innerText = "No cached scan results found.";
        }
    });

    chrome.storage.local.get("manualCheckResults", (data) => {
        let resultsContainer = document.getElementById("manual-check-results");
        resultsContainer.innerHTML = "";

        if (!data.manualCheckResults || Object.keys(data.manualCheckResults).length === 0) {
            resultsContainer.innerHTML = "<p>No cached manual checks found.</p>";
            return;
        }

        Object.entries(data.manualCheckResults).forEach(([url, result]) => {
            let resultItem = document.createElement("div");
            resultItem.innerHTML = `
                <p><strong>URL:</strong> ${url}</p>
                <p><strong>Threat Level:</strong> ${result.threat_level}</p>
                <hr>
            `;
            resultsContainer.appendChild(resultItem);
        });
    });
});
