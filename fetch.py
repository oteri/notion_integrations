import requests
def get_access_token(client_id, client_secret, redirect_uri):
    # Step 1: Get authorization code    
    auth_url = "https://www.linkedin.com/oauth/v2/authorization"
    params = {
        'response_type': 'code',
        'client_id': client_id,
        'redirect_uri': redirect_uri,
        'scope': 'profile email openid'
    }
    r = requests.get(auth_url, params=params)
    print('Visit this URL and authorize:', r.url)

    # After authorization, you'll get a code in the redirect URL
    authorization_code = input('Enter the authorization code: ')

    # Step 2: Exchange authorization code for access token
    token_url = "https://www.linkedin.com/oauth/v2/accessToken"
    token_data = {
        'grant_type': 'authorization_code',
        'code': authorization_code,
        'redirect_uri': redirect_uri,
        'client_id': client_id,
        'client_secret': client_secret
    }
    response = requests.post(token_url, data=token_data)
    return response.json()['access_token']


def get_profile(access_token):
    profile_url = "https://api.linkedin.com/v2/userinfo"
    headers = {
        'Authorization': f'Bearer {access_token}',
        'X-RestLi-Protocol-Version': '2.0.0'
    }
    response = requests.get(profile_url, headers=headers)
    return response.json()

def get_saved_posts(access_token):
    profile_url = "https://www.linkedin.com/my-items/saved-posts"
    headers = {
        'Authorization': f'Bearer {access_token}',
        'X-RestLi-Protocol-Version': '2.0.0'
    }
    response = requests.get(profile_url, headers=headers)
    content = response.content
    return content

# Example usage
access_token = get_access_token(client_id=,
                client_secret=, 
                redirect_uri=)
saved_posts = get_saved_posts(access_token=access_token)
profile_data = get_profile(access_token=access_token)
print(profile_data)