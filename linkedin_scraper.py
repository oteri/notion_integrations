import os
import csv
import argparse
from dotenv import load_dotenv
from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
import time
import logging
import html2text

# Set up logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')

# Load environment variables from .env file
load_dotenv()

# Initialize HTML to Markdown converter
html_converter = html2text.HTML2Text()
html_converter.ignore_links = False
html_converter.body_width = 0  # Disable line wrapping

def setup_driver():
    chrome_options = Options()
    chrome_options.add_argument("--headless")  # Enable headless mode
    chrome_options.add_argument("--disable-gpu")  # Disable GPU hardware acceleration
    chrome_options.add_argument("--window-size=1920x1080")  # Set a standard window size
    chrome_options.add_argument("--no-sandbox")  # Bypass OS security model
    chrome_options.add_argument("--disable-dev-shm-usage")  # Overcome limited resource problems
    
    # Add a user-agent to mimic a real browser
    chrome_options.add_argument("user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/90.0.4430.212 Safari/537.36")
    
    return webdriver.Chrome(options=chrome_options)

def login_to_linkedin(driver, username, password):
    driver.get("https://www.linkedin.com/login")
    
    try:
        username_field = WebDriverWait(driver, 10).until(
            EC.presence_of_element_located((By.ID, "username"))
        )
        username_field.send_keys(username)
        
        password_field = driver.find_element(By.ID, "password")
        password_field.send_keys(password)
        
        login_button = driver.find_element(By.CSS_SELECTOR, "button[type='submit']")
        login_button.click()
        
        WebDriverWait(driver, 10).until(
            EC.presence_of_element_located((By.ID, "global-nav"))
        )
        logging.info("Successfully logged in to LinkedIn")
    except Exception as e:
        logging.error(f"Failed to log in: {str(e)}")
        raise

def get_saved_posts(driver):
    driver.get("https://www.linkedin.com/my-items/saved-posts/")
    
    scraped_data = []
    try:
        WebDriverWait(driver, 10).until(
            EC.presence_of_element_located((By.CLASS_NAME, "reusable-search__result-container"))
        )
        posts = driver.find_elements(By.CLASS_NAME, "reusable-search__result-container")
        
        for post in posts:
            try:
                author_element = post.find_element(By.CSS_SELECTOR, ".entity-result__title-text a")
                text_element = post.find_element(By.CLASS_NAME, "entity-result__content-summary")
                post_container = post.find_element(By.CLASS_NAME, "fbaBTNXFvtyYqIWcwyDdVdXdvvkTDBXEvIbGKw")

                author = author_element.text.strip()
                html_content = text_element.get_attribute("innerHTML").strip()
                markdown_content = html_converter.handle(html_content)
                
                urn_attribute = post_container.get_attribute("data-chameleon-result-urn")
                activity_id = urn_attribute.split(":")[-1] if urn_attribute else None
                
                link = f"https://www.linkedin.com/feed/update/urn:li:activity:{activity_id}/" if activity_id else None

                if link:
                    scraped_data.append({
                        "author": author,
                        "markdown_content": markdown_content,
                        "link": link
                    })
            except Exception as e:
                logging.warning(f"Error scraping post: {str(e)}")
        
        logging.info(f"Successfully scraped {len(scraped_data)} posts")
    except Exception as e:
        logging.error(f"Failed to scrape saved posts: {str(e)}")
    
    return scraped_data

def save_to_csv(data, filename):
    try:
        with open(filename, 'w', newline='', encoding='utf-8') as csvfile:
            fieldnames = ['author', 'markdown_content', 'link']
            writer = csv.DictWriter(csvfile, fieldnames=fieldnames)
            
            writer.writeheader()
            for post in data:
                writer.writerow(post)
        
        logging.info(f"Successfully saved {len(data)} posts to {filename}")
    except Exception as e:
        logging.error(f"Failed to save data to CSV: {str(e)}")

def main():
    parser = argparse.ArgumentParser(description='Scrape LinkedIn saved posts and save to CSV.')
    parser.add_argument('--output', type=str, default='saved_posts.csv',
                        help='Output CSV file name (default: saved_posts.csv)')
    args = parser.parse_args()

    driver = setup_driver()
    
    try:
        # Use environment variables loaded from .env file
        username = os.getenv('LINKEDIN_USERNAME')
        password = os.getenv('LINKEDIN_PASSWORD')
        
        if not username or not password:
            logging.error("LinkedIn credentials not found in .env file")
            return
        
        login_to_linkedin(driver, username, password)
        saved_posts = get_saved_posts(driver)
        
        # Save the scraped posts to CSV
        save_to_csv(saved_posts, args.output)
    
    except Exception as e:
        logging.error(f"An error occurred: {str(e)}")
    finally:
        driver.quit()

if __name__ == "__main__":
    main()