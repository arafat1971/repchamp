"""
Helper script to fetch and reply to Google Play Console reviews for RepChamp.
Usage:
    python3 scripts/reply_reviews.py --list
    python3 scripts/reply_reviews.py --reply <review_id> --text "Your response"
"""

import argparse
import json
import sys
import urllib.parse
import urllib.request
from google.oauth2 import service_account
import google.auth.transport.requests

PACKAGE_NAME = 'gg.repchamp.app'
KEY_FILE = 'play-publisher.json'
SCOPES = ['https://www.googleapis.com/auth/androidpublisher']

def get_auth_token():
    creds = service_account.Credentials.from_service_account_file(KEY_FILE, scopes=SCOPES)
    creds.refresh(google.auth.transport.requests.Request())
    return creds.token

def list_reviews():
    token = get_auth_token()
    url = f'https://androidpublisher.googleapis.com/androidpublisher/v3/applications/{PACKAGE_NAME}/reviews?maxResults=50'
    req = urllib.request.Request(url, headers={'Authorization': f'Bearer {token}'})
    try:
        with urllib.request.urlopen(req) as resp:
            data = json.loads(resp.read().decode('utf-8'))
            return data.get('reviews', [])
    except Exception as e:
        print(f"Error fetching reviews: {e}", file=sys.stderr)
        return []

def reply_review(review_id: str, reply_text: str):
    if len(reply_text) > 350:
        raise ValueError(f"Reply text exceeds Google Play 350-character limit ({len(reply_text)} chars)")
    
    token = get_auth_token()
    url = f'https://androidpublisher.googleapis.com/androidpublisher/v3/applications/{PACKAGE_NAME}/reviews/{urllib.parse.quote(review_id)}:reply'
    payload = json.dumps({'replyText': reply_text}).encode('utf-8')
    req = urllib.request.Request(
        url,
        data=payload,
        method='POST',
        headers={
            'Authorization': f'Bearer {token}',
            'Content-Type': 'application/json'
        }
    )
    with urllib.request.urlopen(req) as resp:
        return json.loads(resp.read().decode('utf-8'))

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description="Manage Google Play Reviews")
    parser.add_argument('--list', action='store_true', help="List recent reviews")
    parser.add_argument('--reply', type=str, help="Review ID to reply to")
    parser.add_argument('--text', type=str, help="Reply text (max 350 chars)")
    args = parser.parse_args()

    if args.list:
        reviews = list_reviews()
        print(json.dumps(reviews, indent=2))
    elif args.reply and args.text:
        print(f"Posting reply to review {args.reply}...")
        res = reply_review(args.reply, args.text)
        print("Response:", json.dumps(res, indent=2))
    else:
        parser.print_help()

