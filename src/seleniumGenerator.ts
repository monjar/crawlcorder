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
import pandas as pd
import os
from urllib.parse import urlparse

# Configuration
base_url = "${baseUrl || ""}"  # Website URL

# Initialize DataFrame to store scraped data
scraped_data = []

scraped_file_name = f"scraped_data_{int(time.time())}.csv"


def save_scraped_data():
    if scraped_data:
        df = pd.DataFrame(scraped_data)

        # Save to CSV file in the main download directory
        output_filename = os.path.join(main_download_dir, scraped_file_name)
        df.to_csv(output_filename, index=False)
        print(f"\nData saved to: {output_filename}")
    else:
        print("\nNo data was scraped.")

# Create download directory structure
def setup_download_directories():
    """Create the main download directory based on site URL"""
    parsed_url = urlparse(base_url)
    site_name = parsed_url.netloc.replace('.', '_').replace(':', '_')
    main_download_dir = os.path.join(os.getcwd(), "downloads", site_name)
    os.makedirs(main_download_dir, exist_ok=True)
    return main_download_dir

def setup_row_download_dir(main_dir, folder_name):
    """Create download directory for specific row"""
    row_dir = os.path.join(main_dir, f"{folder_name}")
    os.makedirs(row_dir, exist_ok=True)
    return row_dir

def configure_chrome_options(download_dir):
    """Configure Chrome options with custom download directory"""
    chrome_options = webdriver.ChromeOptions()
    
    # Performance optimizations
    chrome_options.add_argument("--headless")  # Run in headless mode
    chrome_options.add_argument("--no-sandbox")
    chrome_options.add_argument("--disable-dev-shm-usage")
    chrome_options.add_argument("--disable-gpu")
    chrome_options.add_argument("--disable-extensions")
    chrome_options.add_argument("--disable-plugins")
    chrome_options.add_argument("--disable-images")  # Don't load images
    chrome_options.add_argument("--disable-web-security")
    chrome_options.add_argument("--disable-features=VizDisplayCompositor")
    
    prefs = {
        "download.default_directory": download_dir,
        "download.prompt_for_download": False,
        "download.directory_upgrade": True,
        "safebrowsing.enabled": False,
        "profile.managed_default_content_settings.images": 2,  # Block images
        "profile.default_content_setting_values.notifications": 2,  # Block notifications
        "profile.managed_default_content_settings.media_stream": 2,  # Block media
    }
    chrome_options.add_experimental_option("prefs", prefs)
    chrome_options.add_experimental_option("useAutomationExtension", False)
    chrome_options.add_experimental_option("excludeSwitches", ["enable-automation"])
    
    return chrome_options


# Setup main download directory
main_download_dir = setup_download_directories()

# Initialize the driver with download preferences
chrome_options = configure_chrome_options(main_download_dir)
driver = webdriver.Chrome(options=chrome_options)
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

def navigate_to_page(target_page, next_button_selector):
    """Navigate to a specific page number"""
    current_page = 1
    while current_page < target_page:
        try:
            next_button = WebDriverWait(driver, 5).until(
                EC.element_to_be_clickable((By.CSS_SELECTOR, next_button_selector))
            )
            print(f"Navigating from page {current_page} to page {current_page + 1}")
            driver.execute_script("arguments[0].scrollIntoView(true);", next_button)
            time.sleep(0.5)
            driver.execute_script("arguments[0].click();", next_button)
            time.sleep(1)
            current_page += 1
        except Exception as e:
            print(f"Error navigating to page {target_page}: {str(e)}")
            continue

def process_table_with_pagination(table_element, table_config):
    """Process all pages of a table with pagination"""
    actions_in_loop = table_config.get("actions", [])
    next_button_selector = table_config.get("nextButtonSelector")
    
    page_number = 1
    
    while True:
        print(f"Processing page {page_number}")
        
        # Process current page rows with page context
        process_table_rows(table_element, actions_in_loop, page_number, next_button_selector)
        
        # Check if there's a next button and if it's clickable
        if next_button_selector:
            try:
                next_button = WebDriverWait(driver, 5).until(
                    EC.element_to_be_clickable((By.CSS_SELECTOR, next_button_selector))
                )
                
                # Check if button is disabled or if we're on the last page
                if (next_button.get_attribute("disabled") or 
                    "disabled" in next_button.get_attribute("class") or 
                    next_button.get_attribute("aria-disabled") == "true"):
                    print("Reached last page - next button is disabled")
                    break
                
                print(f"Clicking next button to go to page {page_number + 1}")
                driver.execute_script("arguments[0].scrollIntoView(true);", next_button)
                time.sleep(0.5)
                driver.execute_script("arguments[0].click();", next_button)
                time.sleep(1)
                
                page_number += 1
                
            except Exception as e:
                print(f"No more pages or error clicking next button: {str(e)}")
                break
        else:
            print("No pagination button specified - processing single page only")
            break
    
    print(f"Completed processing {page_number} page(s)")

def wait_for_new_tab_and_download(original_tabs_count, page, row_index, timeout=30):
    """Wait for new tab to open and download to start"""
    start_time = time.time()
    
    # FIRST: Set up the download directory BEFORE any download starts
    row_download_dir = setup_row_download_dir(
        main_download_dir, f"page_{page}_row_{row_index + 1}"
    )
    print(f"Setting download directory for row {row_index + 1}: {row_download_dir}")
    
    # Update Chrome download preferences BEFORE checking for downloads
    driver.execute_cdp_cmd(
        "Page.setDownloadBehavior",
        {"behavior": "allow", "downloadPath": row_download_dir},
    )

    # Wait for new tab to open
    while len(driver.window_handles) <= original_tabs_count:
        if time.time() - start_time > 30:
            print("Timeout waiting for new tab to open")
            return False
        time.sleep(0.5)

    print("New tab detected")

    # Monitor the ROW-SPECIFIC download directory for new files
    initial_files = set()
    try:
        initial_files = set(os.listdir(row_download_dir))
    except:
        initial_files = set()
    
    download_started = False

    while time.time() - start_time < timeout:
        try:
            current_files = set(os.listdir(row_download_dir))
            new_files = current_files - initial_files
            
            if new_files:
                download_started = True
                print(f"Download detected in row directory: {new_files}")
                break
        except:
            pass
            
        time.sleep(1)

    # Close the download tab and switch back to main tab
    if len(driver.window_handles) > original_tabs_count:
        driver.switch_to.window(driver.window_handles[-1])
        driver.close()
        driver.switch_to.window(driver.window_handles[0])
        print("Closed download tab and returned to main tab")
    
    return download_started

def wait_for_download_completion(timeout=120):
    """Wait for all downloads to complete"""
    start_time = time.time()
    
    while time.time() - start_time < timeout:
        downloading_files = []
        try:
            for file in os.listdir(main_download_dir):
                if file.endswith(('.crdownload', '.tmp', '.part')):
                    downloading_files.append(file)
        except:
            pass
            
        if not downloading_files:
            print("All downloads completed")
            return True
            
        print(f"Still downloading: {downloading_files}")
        time.sleep(2)
    
    print("Download timeout reached")
    return False

def process_table_rows(table_element, actions_in_loop, current_page_number=1, next_button_selector=None):
    """Process all rows in a table, executing actions for each row"""
    try:
        tbody = WebDriverWait(driver, 10).until(
            EC.presence_of_element_located((By.TAG_NAME, "tbody"))
        )
        rows = tbody.find_elements(By.TAG_NAME, "tr")
        total_rows = len(rows)
        print(f"Found {total_rows} rows to process on page {current_page_number}")

        for row_index in range(total_rows):
            try:
                print(f"Processing row {row_index + 1}/{total_rows} on page {current_page_number}")

                row_data = {
                    "page_number": current_page_number,
                    "row_index": row_index + 1,
                    "global_row_id": f"page_{current_page_number}_row_{row_index + 1}"
                }

                tbody = WebDriverWait(driver, 10).until(
                    EC.presence_of_element_located((By.TAG_NAME, "tbody"))
                )

                rows = tbody.find_elements(By.TAG_NAME, "tr")
                current_row = rows[row_index]
                
                navigated_away = False
                
                for action in actions_in_loop:
                    try:
                        if action["type"] == "label":
                            cell = current_row.find_element(By.CSS_SELECTOR, action["relative_selector"])
                            value = cell.text.strip()
                            print(f"{action['label']}: {value}")
                            row_data[action['label']] = value

                        elif action["type"] == "click":
                            selector = action["relative_selector"].split(">")[-1].strip()
                            link = current_row.find_element(By.CSS_SELECTOR, selector)
                            original_tabs = len(driver.window_handles)

                            driver.execute_script("arguments[0].scrollIntoView(true);", link)
                            time.sleep(0.5)
                            driver.execute_script("arguments[0].click();", link)
                            time.sleep(1)

                            if len(driver.window_handles) > original_tabs:
                                print("New tab detected - handling download")
                                download_started = wait_for_new_tab_and_download(
                                    original_tabs, current_page_number, row_index
                                )
                            navigated_away = True

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
                                            row_data[post_action['label']] = value
                                        elif post_action["type"] == "click":
                                            element = WebDriverWait(driver, 10).until(
                                                EC.element_to_be_clickable(
                                                    (By.CSS_SELECTOR, post_action["selector"])
                                                )
                                            )

                                            original_tabs = len(driver.window_handles)

                                            driver.execute_script("arguments[0].scrollIntoView(true);", element)
                                            time.sleep(0.5)
                                            driver.execute_script("arguments[0].click();", element)
                                            time.sleep(0.5)
                                            if len(driver.window_handles) > original_tabs:
                                                print("New tab detected - handling download")
                                                download_started = wait_for_new_tab_and_download(
                                                    original_tabs, current_page_number, row_index
                                                )
                                        elif post_action["type"] == "input":
                                            try:
                                                # Try multiple selectors for better compatibility
                                                selectors_to_try = [
                                                    post_action["selector"],
                                                    f"input[class*='{post_action['selector'].split('.')[-1]}']",
                                                    f"input[type='checkbox'][class*='datatable']",
                                                    f"input[type='checkbox'][part='checkbox']"
                                                ]
                                                
                                                element = None
                                                # for selector in selectors_to_try:
                                                #     try:
                                                #         element = WebDriverWait(driver, 3).until(
                                                #             EC.presence_of_element_located(
                                                #                 (By.CSS_SELECTOR, selector)
                                                #             )
                                                #         )
                                                #         break
                                                #     except:
                                                #         continue
                                                
                                                if element is None:
                                                    element = WebDriverWait(driver, 3).until(
                                                        EC.presence_of_element_located(
                                                            (By.XPATH, "//input[@type='checkbox' and contains(@class, 'datatable')]")
                                                        )
                                                    )
                                                
                                                # Check element type and handle accordingly
                                                element_type = element.get_attribute("type")
                                                if element_type in ["checkbox", "radio"]:
                                                    driver.execute_script("arguments[0].click();", element)
                                                else:
                                                    element.clear()
                                                    element.send_keys(post_action["value"])
                                                time.sleep(1)
                                            except Exception as e:
                                                print(f"Input action failed: {str(e)}")
                                    except Exception as e:
                                        print(f"Error in detail page: {str(e)}")
                                
                                if navigated_away:
                                    try:
                                        print(f"Going back to page {current_page_number}")
                                        driver.back()
                                        time.sleep(0.5)
                                        
                                        if current_page_number > 1 and next_button_selector:
                                            navigate_to_page(current_page_number, next_button_selector)
                                            
                                        tbody = WebDriverWait(driver, 10).until(
                                            EC.presence_of_element_located((By.TAG_NAME, "tbody"))
                                        )
                                        rows = tbody.find_elements(By.TAG_NAME, "tr")
                                        if row_index < len(rows):
                                            current_row = rows[row_index]
                                        
                                        navigated_away = False
                                        
                                    except Exception as e:
                                        print(f"Error going back and navigating: {str(e)}")

                        elif action["type"] == "input":
                            selector = action["relative_selector"].split(">")[-1].strip()
                            input_element = current_row.find_element(By.CSS_SELECTOR, selector)
                            input_element.clear()
                            input_element.send_keys(action["value"])
                            time.sleep(1)

                    except StaleElementReferenceException:
                        print(f"Stale element in row {row_index + 1}, retrying...")
                        time.sleep(1)
                        break
                    except Exception as e:
                        print(f"Error processing action in row {row_index + 1}: {str(e)}")
                        continue

                scraped_data.append(row_data)
                save_scraped_data()
            except Exception as e:
                print(f"Error processing row {row_index + 1}: {str(e)}")
                continue

    except Exception as e:
        print(f"Error processing table: {str(e)}")
        raise`;

  let mainCode = "";
  let currentTableLoop: {
    selector: string;
    actions: any[];
    nextButtonSelector?: string;
  } | null = null;
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

    if (action.type === "tablePaginationNext") {
      if (currentTableLoop) {
        currentTableLoop.nextButtonSelector = action.selector;
      }
      continue;
    }

    if (action.type === "tableLoopEnd") {
      insideTableLoop = false;
      if (currentTableLoop) {
        const tableLoopData = {
          actions: currentTableLoop.actions,
          nextButtonSelector: currentTableLoop.nextButtonSelector,
        };
        mainCode += `\n# Process table with pagination\nprocess_table_with_pagination(table_element, ${JSON.stringify(
          tableLoopData,
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

      // Check if this action is within the table (part of the table structure)
      const isWithinTable = action.selector.includes(currentTableLoop.selector);

      if (action.type === "click") {
        if (isWithinTable) {
          // This is a click within the table row (like clicking a link in a cell)
          currentTableLoop.actions.push({
            type: action.type,
            relative_selector: relativeSelector,
            post_click_actions: [],
          });
        } else {
          // This is a click outside the table (like on a detail page after navigation)
          const lastClickAction =
            currentTableLoop.actions[currentTableLoop.actions.length - 1];
          if (lastClickAction?.type === "click") {
            lastClickAction.post_click_actions =
              lastClickAction.post_click_actions || [];
            lastClickAction.post_click_actions.push({
              type: "click",
              selector: action.selector,
              post_click_actions: [],
            });
          }
        }
      } else if (action.type === "label") {
        if (isWithinTable) {
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
      } else if (action.type === "input") {
        if (isWithinTable) {
          currentTableLoop.actions.push({
            type: action.type,
            relative_selector: relativeSelector,
            value: action.value,
          });
        } else {
          const lastClickAction =
            currentTableLoop.actions[currentTableLoop.actions.length - 1];
          if (lastClickAction?.type === "click") {
            lastClickAction.post_click_actions =
              lastClickAction.post_click_actions || [];
            lastClickAction.post_click_actions.push({
              type: "input",
              selector: action.selector,
              value: action.value,
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

  mainCode += `
  \n# Create DataFrame and export results
  print("Scraping completed successfully!")
  
  save_scraped_data()
  
  driver.quit()`;

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
