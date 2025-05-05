/// <reference path="./types.ts" />

function escapeSelector(selector: string): string {
  return selector.replace(/([#.][^.>\s]+)/g, (match) => {
    if (match.includes("\\")) {
      return `css_escape("${match.replace(/\\/g, "\\\\")}")`;
    }
    return match;
  });
}

function generalizeTableSelector(
  selector: string,
  tableSelector: string
): string {
  if (selector.startsWith(tableSelector)) {
    const relativePath = selector.substring(tableSelector.length);
    return relativePath
      .replace(/\s*>\s*tbody\s*>\s*tr[^>]*/, "")
      .replace(/tr[^>]*:nth-of-type\(\d+\)/, "")
      .replace(/^[>\s]+/, "");
  }
  return selector;
}

function generateSeleniumCode(
  actions: Types.Action[],
  baseUrl?: string
): string {
  const imports = `from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.common.action_chains import ActionChains
from selenium.common.exceptions import StaleElementReferenceException, TimeoutException
import time
import re

# Configuration
base_url = "${baseUrl || ""}"  # Website URL

# Initialize the driver
driver = webdriver.Chrome()
driver.implicitly_wait(10)
wait = WebDriverWait(driver, 10)

# Navigate to the base URL
driver.get(base_url)`;

  const helperFunctions = `
def css_escape(selector: str) -> str:
    """Handle complex CSS selectors with escape sequences"""
    if not selector.startswith('#'):
        return selector
    raw_id = selector[1:]
    return '#' + re.sub(r'\\\\([0-9a-fA-F]{2,6})', lambda m: chr(int(m.group(1), 16)), raw_id)

def find_element_safely(selector: str):
    """Wait for element to be present and return it"""
    processed_selector = selector if not selector.startswith('#\\\\') else css_escape(selector)
    return wait.until(
        EC.presence_of_element_located((By.CSS_SELECTOR, processed_selector))
    )

def process_table_rows(table_element, actions_in_loop):
    """Process all rows in a table, executing actions for each row"""
    try:
        # Wait for table to be present and get rows
        tbody = WebDriverWait(driver, 10).until(
            EC.presence_of_element_located((By.TAG_NAME, "tbody"))
        )
        rows = tbody.find_elements(By.TAG_NAME, "tr")
        total_rows = len(rows)
        print(f"Found {total_rows} rows to process")

        for row_index in range(total_rows):
            try:
                print(f"\\nProcessing row {row_index + 1}/{total_rows}")

                # Wait for table to be present again and get fresh rows
                tbody = WebDriverWait(driver, 10).until(
                    EC.presence_of_element_located((By.TAG_NAME, "tbody"))
                )
                rows = tbody.find_elements(By.TAG_NAME, "tr")
                current_row = rows[row_index]

                for action in actions_in_loop:
                    try:
                        if action["type"] == "label":
                            # Extract text directly from the cell
                            selector = action["relative_selector"].split(">")[-1].strip()
                            cell = current_row.find_element(By.CSS_SELECTOR, selector)
                            value = cell.text.strip()
                            print(f"{action['label']}: {value}")

                        elif action["type"] == "click":
                            # Find and click link directly in row
                            selector = action["relative_selector"].split(">")[-1].strip()
                            link = current_row.find_element(By.CSS_SELECTOR, selector)
                            
                            # Scroll and click
                            driver.execute_script("arguments[0].scrollIntoView(true);", link)
                            time.sleep(1)
                            driver.execute_script("arguments[0].click();", link)
                            time.sleep(2)

                            # Handle post-click actions
                            if action.get("post_click_actions"):
                                for post_action in action["post_click_actions"]:
                                    try:
                                        if post_action["type"] == "label":
                                            element = WebDriverWait(driver, 10).until(
                                                EC.presence_of_element_located(
                                                    (By.CSS_SELECTOR, post_action["selector"])
                                                )
                                            )
                                            value = element.text.strip()
                                            print(f"{post_action['label']}: {value}")
                                    except Exception as e:
                                        print(f"Error in detail page: {str(e)}")
                                    finally:
                                        driver.back()
                                        time.sleep(2)

                    except StaleElementReferenceException:
                        print(f"Stale element in row {row_index + 1}, retrying...")
                        time.sleep(1)
                        break  # Break inner loop to retry row
                    except Exception as e:
                        print(f"Error processing action in row {row_index + 1}: {str(e)}")
                        continue

            except Exception as e:
                print(f"Error processing row {row_index + 1}: {str(e)}")
                continue

    except Exception as e:
        print(f"Error processing table: {str(e)}")
        raise`;

  let mainCode = "";
  let currentTableLoop: { selector: string; actions: any[] } | null = null;
  let insideTableLoop = false;

  // Process actions
  for (const action of actions) {
    if (action.type === "tableLoopStart") {
      currentTableLoop = {
        selector: action.selector,
        actions: [],
      };
      insideTableLoop = true;
      mainCode += `\n# Start table loop\ntable_element = find_element_safely("${escapeSelector(
        action.selector
      )}")`;
      continue;
    }

    if (action.type === "tableLoopEnd") {
      insideTableLoop = false;
      if (currentTableLoop) {
        mainCode += `\n# Process table rows\nprocess_table_rows(table_element, ${JSON.stringify(
          currentTableLoop.actions,
          null,
          2
        )})`;
      }
      currentTableLoop = null;
      continue;
    }

    if (insideTableLoop && currentTableLoop) {
      const relativeSelector = generalizeTableSelector(
        action.selector,
        currentTableLoop.selector
      );
      if (action.type === "click") {
        currentTableLoop.actions.push({
          type: action.type,
          relative_selector: relativeSelector,
          post_click_actions: [],
        });
      } else if (action.type === "label") {
        if (action.selector.includes(currentTableLoop.selector)) {
          currentTableLoop.actions.push({
            type: action.type,
            relative_selector: relativeSelector,
            label: action.label,
          });
        } else {
          const lastClickAction =
            currentTableLoop.actions[currentTableLoop.actions.length - 1];
          if (lastClickAction?.type === "click") {
            lastClickAction.post_click_actions =
              lastClickAction.post_click_actions || [];
            lastClickAction.post_click_actions.push({
              type: "label",
              selector: action.selector,
              label: action.label,
            });
          }
        }
      }
    } else {
      // Regular actions outside table loop
      switch (action.type) {
        case "click":
          mainCode += `\n# Click action\nelement = find_element_safely("${escapeSelector(
            action.selector
          )}")\nelement.click()`;
          break;
        case "input":
          mainCode += `\n# Input action\nelement = find_element_safely("${escapeSelector(
            action.selector
          )}")\nelement.clear()\nelement.send_keys("${action.value?.replace(
            /"/g,
            '\\"'
          )}")`;
          break;
      }
    }
  }

  mainCode += `\n\nprint("Scraping completed successfully!")\ndriver.quit()`;

  return `${imports}\n\n${helperFunctions}\n\ntry:\n${mainCode}\nexcept Exception as e:\n    print(f"An error occurred: {str(e)}")\nfinally:\n    driver.quit()`;
}

function downloadSeleniumScript(actions: Types.Action[]): void {
  chrome.storage.local.get(
    ["baseUrl"],
    (result: Partial<Types.StorageData>) => {
      const code = generateSeleniumCode(actions, result.baseUrl);
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
  );
}
