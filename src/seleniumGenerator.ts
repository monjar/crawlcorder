/// <reference path="./types.ts" />

function escapeSelector(selector: string): string {
  // Handle all parts of the selector that contain escape sequences
  return selector.replace(/([#.][^.>\s]+)/g, (match) => {
    // If it contains escape sequences, wrap in css_escape function
    if (match.includes("\\")) {
      return `${match.replace(/\\/g, "\\\\")}`;
    }
    return match;
  });
}

function generateSeleniumCode(actions: Types.Action[]): string {
  const imports = `from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.common.action_chains import ActionChains
import time
import re

# Configuration
base_url = ""  # Replace with the website's URL

# Initialize the driver
driver = webdriver.Chrome()  # Make sure you have ChromeDriver installed
driver.implicitly_wait(10)  # Set implicit wait
wait = WebDriverWait(driver, 10)  # Explicit wait object

# Navigate to the base URL
driver.get(base_url)
`;

  const helperFunctions = `
def css_escape(selector: str) -> str:
    """Handle complex CSS selectors with escape sequences"""
    # Remove the '#' and process escape sequences
    raw_id = selector[1:]
    # Use regex to convert escape sequences to actual characters
    return '#' + re.sub(r'\\\\([0-9a-fA-F]{2,6})', lambda m: chr(int(m.group(1), 16)), raw_id)

def find_element_safely(selector: str):
    """Wait for element to be present and return it"""
    processed_selector = selector if not selector.startswith('#\\\\') else css_escape(selector)
    return wait.until(EC.presence_of_element_located((By.CSS_SELECTOR, processed_selector)))

def process_table_rows(table_element, next_button_selector=None):
    """Process all rows in a table, handling pagination if provided"""
    while True:
        # Get all rows in current page
        rows = table_element.find_elements(By.TAG_NAME, "tr")
        for row in rows[1:]:  # Skip header row
            # Process each cell in the row
            cells = row.find_elements(By.TAG_NAME, "td")
            for cell in cells:
                print(cell.text)  # Replace with your row processing logic
        
        # Handle pagination if next button exists
        if next_button_selector:
            try:
                next_button = driver.find_element(By.CSS_SELECTOR, next_button_selector)
                if not next_button.is_displayed() or not next_button.is_enabled():
                    break
                next_button.click()
                time.sleep(1)  # Wait for table to update
            except:
                break
        else:
            break
`;

  let mainCode = `
try:`;

  let currentTableLoop: { selector: string; nextSelector?: string } | null =
    null;

  for (const action of actions) {
    switch (action.type) {
      case "click":
        mainCode += `
    # Click action
    element = find_element_safely("${escapeSelector(action.selector)}")
    element.click()`;
        break;

      case "input":
        mainCode += `
    # Input action
    element = find_element_safely("${escapeSelector(action.selector)}")
    element.clear()
    element.send_keys("${action.value?.replace(/"/g, '\\"')}")`;
        break;

      case "label":
        mainCode += `
    # Label extraction
    element = find_element_safely("${escapeSelector(action.selector)}")
    ${action.label} = element.text  # Store the labeled data`;
        break;

      case "tableLoopStart":
        currentTableLoop = {
          selector: action.selector,
          nextSelector: (action as Types.TableLoopAction).nextSelector,
        };
        mainCode += `
    # Start table loop
    table_element = find_element_safely("${escapeSelector(action.selector)}")`;
        break;

      case "tableLoopEnd":
        if (currentTableLoop) {
          mainCode += `
    # Process table with pagination
    process_table_rows(table_element${
      currentTableLoop.nextSelector
        ? `, "${escapeSelector(currentTableLoop.nextSelector)}"`
        : ""
    })`;
          currentTableLoop = null;
        }
        break;

      case "tablePaginationNext":
        if (currentTableLoop) {
          currentTableLoop.nextSelector = action.selector;
        }
        break;
    }
  }

  const errorHandling = `
except Exception as e:
    print(f"An error occurred: {str(e)}")
finally:
    driver.quit()  # Clean up the driver
`;

  return imports + helperFunctions + mainCode + errorHandling;
}

function downloadSeleniumScript(actions: Types.Action[]): void {
  const code = generateSeleniumCode(actions);
  const blob = new Blob([code], { type: "text/plain" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "selenium_script.py";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
