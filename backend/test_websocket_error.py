"""Test WebSocket error handling directly."""
import asyncio
import json
import websockets

async def test_error_message():
    """Test that error messages are sent correctly via WebSocket."""
    # First, we need a valid session ID - let's get one from the API
    import httpx

    # Create a test project
    async with httpx.AsyncClient() as client:
        # Create project
        project_response = await client.post(
            "http://127.0.0.1:8000/api/v1/projects",
            json={
                "name": "WebSocket Test Project",
                "description": "Testing error handling"
            }
        )
        project = project_response.json()
        project_id = project["id"]
        print(f"Created project: {project_id}")

        # Create chat session
        chat_response = await client.post(
            f"http://127.0.0.1:8000/api/v1/projects/{project_id}/chat-sessions",
            json={
                "name": "Error Test Chat"
            }
        )
        print(f"Chat response status: {chat_response.status_code}")
        chat = chat_response.json()
        print(f"Chat response: {chat}")
        session_id = chat.get("id") or chat.get("chat_session", {}).get("id")
        if not session_id:
            print(f"ERROR: Could not get session ID from response: {chat}")
            return
        print(f"Created chat session: {session_id}")

    # Connect to WebSocket
    uri = f"ws://127.0.0.1:8000/api/v1/chats/{session_id}/stream"
    print(f"\nConnecting to WebSocket: {uri}")

    async with websockets.connect(uri) as websocket:
        print("✓ WebSocket connected")

        # Send a message
        message = {
            "type": "message",
            "content": "test message that will trigger error due to missing/invalid API key"
        }
        await websocket.send(json.dumps(message))
        print(f"\n→ Sent message: {message['content']}")

        # Collect all responses
        messages_received = []
        error_found = False
        end_found = False

        print("\n← Receiving messages:")
        try:
            async for response in websocket:
                data = json.loads(response)
                messages_received.append(data)
                msg_type = data.get("type")

                print(f"  {len(messages_received)}. Type: {msg_type}")

                if msg_type == "error":
                    error_found = True
                    error_content = data.get("content", "")
                    print(f"     ✓ ERROR MESSAGE: {error_content[:100]}...")

                elif msg_type == "end":
                    end_found = True
                    has_error = data.get("error", False)
                    print(f"     ✓ END (error={has_error})")
                    break

                elif msg_type == "user_message_saved":
                    print(f"     User message saved")

                elif msg_type == "start":
                    print(f"     Agent started")

                elif msg_type in ["thought", "chunk"]:
                    content = data.get("content", "")
                    print(f"     Content: {content[:50]}...")

        except websockets.exceptions.ConnectionClosed:
            print("  WebSocket connection closed")

        print(f"\n=== RESULTS ===")
        print(f"Total messages received: {len(messages_received)}")
        print(f"Error message found: {error_found}")
        print(f"End message found: {end_found}")

        if error_found and end_found:
            print("\n✓✓✓ SUCCESS: Error handling works correctly!")
            print("   - Error message was sent to client")
            print("   - End message was sent to unblock UI")
        else:
            print("\n✗✗✗ FAILURE: Error handling broken")
            if not error_found:
                print("   - No error message was sent")
            if not end_found:
                print("   - No end message was sent (UI will stay blocked)")

        print(f"\nAll message types received: {[m['type'] for m in messages_received]}")


if __name__ == "__main__":
    asyncio.run(test_error_message())
