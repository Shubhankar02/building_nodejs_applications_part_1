class ChatApp {
    constructor() {
        this.socket = null;
        this.currentRoom = null;
        this.username = null;
        this.typingTimer = null;
        this.isTyping = false;
        this.initializeElements();
        this.connectToServer();
        this.setupEventListeners();
    }
    initializeElements() {
        // Get DOM elements
        this.messagesContainer = document.getElementById("messages-container");
        this.messageInput = document.getElementById("message-input");
        this.sendBtn = document.getElementById("send-btn");
        this.roomInput = document.getElementById("room-input");
        this.joinRoomBtn = document.getElementById("join-room-btn");
        this.currentRoomDisplay = document.getElementById("current-room");
        this.usernameDisplay = document.getElementById("username-display");
        this.connectionStatus = document.getElementById("connection-status");
        this.statusMessage = document.getElementById("status-message");
        this.typingIndicator = document.getElementById("typing-indicator");
    }
    connectToServer() {
        // Connect to Socket.io server
        this.socket = io({
            auth: {
                // In a real app, you'd get this from login
                token: null,
            },
        });
        this.setupSocketEvents();
    }
    setupSocketEvents() {
        // Connection events
        this.socket.on("connect", () => {
            console.log("Connected to server");
            this.connectionStatus.classList.remove("disconnected");
            this.updateStatus("Connected to chat server");
        });
        this.socket.on("disconnect", () => {
            console.log("Disconnected from server");
            this.connectionStatus.classList.add("disconnected");
            this.updateStatus("Disconnected from server");
            this.messageInput.disabled = true;
            this.sendBtn.disabled = true;
        });
        this.socket.on("connection_success", (data) => {
            this.username = data.username;
            this.usernameDisplay.textContent = this.username;
            this.updateStatus(`Welcome, ${this.username}!`);
        });
        // Room events
        this.socket.on("room_joined", (data) => {
            this.currentRoom = data.room.name;
            this.currentRoomDisplay.innerHTML =
                `
                <span>${data.room.name}</span>
                `;
            this.messageInput.disabled = false;
            this.sendBtn.disabled = false;
            this.updateStatus(`Joined room: ${data.room.name}`);
            // Clear messages and show room messages
            this.clearMessages();
            this.displayWelcomeMessage(`Joined room: ${data.room.name}`);
            // Display recent messages
            if (data.messages && data.messages.length > 0) {
                data.messages.forEach((message) => {
                    this.displayMessage(message, false);
                });
            }
        });
        this.socket.on("user_joined", (data) => {
            this.displaySystemMessage(`${data.username} joined the room
    `);
        });
        this.socket.on("user_left", (data) => {
            this.displaySystemMessage(`${data.username} left the room
    `);
        });
        // Message events
        this.socket.on("new_message", (data) => {
            this.displayMessage(data, true);
        });
        // Typing events
        this.socket.on("user_typing", (data) => {
            if (data.username !== this.username) {
                this.showTypingIndicator(`${data.username} is typing...`);
            }
        });
        this.socket.on("user_stopped_typing", (data) => {
            this.hideTypingIndicator();
        });
        // Error handling
        this.socket.on("error", (data) => {
            this.updateStatus(`Error: ${data.message}`);
            console.error("Socket error:", data);
        });
    }
    setupEventListeners() {
        // Send message on Enter key
        this.messageInput.addEventListener("keypress", (e) => {
            if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                this.sendMessage();
            }
        });
        // Send message on button click
        this.sendBtn.addEventListener("click", () => {
            this.sendMessage();
        });
        // Join room on Enter key
        this.roomInput.addEventListener("keypress", (e) => {
            if (e.key === "Enter") {
                e.preventDefault();
                this.joinRoom();
            }
        });
        // Join room on button click
        this.joinRoomBtn.addEventListener("click", () => {
            this.joinRoom();
        });
        // Quick room buttons
        document.querySelectorAll(".quick-room-btn").forEach((btn) => {
            btn.addEventListener("click", () => {
                const roomName = btn.dataset.room;
                this.roomInput.value = roomName;
                this.joinRoom();
            });
        });
        // Typing indicators
        this.messageInput.addEventListener("input", () => {
            this.handleTyping();
        });
        this.messageInput.addEventListener("keyup", () => {
            this.handleStoppedTyping();
        });
    }
    sendMessage() {
        const content = this.messageInput.value.trim();
        if (!content || !this.currentRoom) {
            return;
        }
        // Send message to server
        this.socket.emit("send_message", {
            content: content,
            roomName: this.currentRoom,
        });
        // Clear input
        this.messageInput.value = "";
        // Stop typing indicator
        this.handleStoppedTyping();
    }
    joinRoom() {
        const roomName = this.roomInput.value.trim();
        if (!roomName) {
            return;
        }
        // Leave current room if in one
        if (this.currentRoom) {
            this.socket.emit("leave_room", { roomName: this.currentRoom });
        }
        // Join new room
        this.socket.emit("join_room", { roomName });
        this.roomInput.value = "";
    }
    displayMessage(messageData, isNew = false) {
        const messageDiv = document.createElement("div");
        messageDiv.className = "message";
        // Determine if this is own message
        const isOwnMessage = messageData.sender.username === this.username;
        messageDiv.classList.add(isOwnMessage ? "own" : "other");
        const timestamp = new Date(messageData.timestamp).toLocaleTimeString();
        messageDiv.innerHTML =
            `
    <div class="message-header">
    ${messageData.sender.username}
    </div>
    <div class="message-content">${this.escapeHtml(
                messageData.content
            )}</div>
    <div class="message-timestamp">${timestamp}</div>
    `
            ;
        this.messagesContainer.appendChild(messageDiv);
        if (isNew) {
            this.scrollToBottom();
        }
    }
    displaySystemMessage(content) {
        const messageDiv = document.createElement("div");
        messageDiv.className = "message system";
        messageDiv.innerHTML =
            `<div class="message-content">${this.escapeHtml(
                content
            )}</div>`
            ;
        this.messagesContainer.appendChild(messageDiv);
        this.scrollToBottom();
    }
    displayWelcomeMessage(content) {
        const welcomeDiv = document.createElement("div");
        welcomeDiv.className = "welcome-message";
        welcomeDiv.innerHTML =
            `
        <p>${this.escapeHtml(content)}</p>`
            ;
        this.messagesContainer.appendChild(welcomeDiv);
        this.scrollToBottom();
    }
    clearMessages() {
        this.messagesContainer.innerHTML = "";
    }
    handleTyping() {
        if (!this.currentRoom) return;
        if (!this.isTyping) {
            this.isTyping = true;
            this.socket.emit("typing_start", { roomName: this.currentRoom });
        }
        // Clear existing timer
        clearTimeout(this.typingTimer);
        // Set timer to stop typing after 1 second of inactivity
        this.typingTimer = setTimeout(() => {
            this.handleStoppedTyping();
        }, 1000);
    }
    handleStoppedTyping() {
        if (this.isTyping) {
            this.isTyping = false;
            if (this.currentRoom) {
                this.socket.emit("typing_stop"
                    , { roomName: this.currentRoom });
            }
        }
        clearTimeout(this.typingTimer);
    }
    showTypingIndicator(message) {
        this.typingIndicator.textContent = message;
        // Auto-hide after 3 seconds
        setTimeout(() => {
            this.hideTypingIndicator();
        }, 3000);
    }
    hideTypingIndicator() {
        this.typingIndicator.textContent = "";
    }
    updateStatus(message) {
        this.statusMessage.textContent = message;
        // Auto-clear status after 5 seconds
        setTimeout(() => {
            if (this.statusMessage.textContent === message) {
                this.statusMessage.textContent = this.currentRoom
                    ? `Connected to ${this.currentRoom}`
                    : "Connected to chat server";
            }
        }, 5000);
    }
    scrollToBottom() {
        this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
    }
    escapeHtml(text) {
        const div = document.createElement("div");
        div.textContent = text;
        return div.innerHTML;
    }
}
// Initialize the chat application when the page loads
document.addEventListener("DOMContentLoaded", () => {
    new ChatApp();
});