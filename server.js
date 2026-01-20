const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, PutCommand, QueryCommand } = require("@aws-sdk/lib-dynamodb");

// --- AWS CONFIG ---
const REGION = "us-east-1"; 
const TABLE_NAME = "ChatHistory";
const client = new DynamoDBClient({ region: REGION });
const docClient = DynamoDBDocumentClient.from(client);

// --- APP SETUP ---
const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('public'));

const users = {}; 

io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  socket.on('joinRoom', async ({ username, room }) => {
    
    // 1. LEAVE OLD ROOM (If switching)
    const oldUser = users[socket.id];
    if (oldUser && oldUser.room) {
        socket.leave(oldUser.room);
        io.to(oldUser.room).emit('message', { 
            user: 'System', 
            text: `${oldUser.username} has left the room.`, 
            timestamp: new Date().toLocaleTimeString() 
        });
    }

    // 2. JOIN NEW ROOM
    socket.join(room);
    users[socket.id] = { username, room };

    // 3. WELCOME & NOTIFY
    // Send history ONLY to the user who joined
    try {
      const command = new QueryCommand({
        TableName: TABLE_NAME,
        KeyConditionExpression: "RoomID = :r",
        ExpressionAttributeValues: { ":r": room },
        Limit: 50,
        ScanIndexForward: true 
      });
      const response = await docClient.send(command);
      socket.emit('loadHistory', response.Items || []);
    } catch (err) {
      console.error("Error loading history:", err);
    }

    // Broadcast join to others
    socket.to(room).emit('message', {
      user: 'System',
      text: `${username} has joined ${room}.`,
      timestamp: new Date().toLocaleTimeString()
    });
  });

  socket.on('chatMessage', async (msgText) => {
    const user = users[socket.id];
    if (!user) return;

    const messageData = {
      RoomID: user.room,
      Timestamp: Date.now(),
      User: user.username,
      Text: msgText,
      TimeFormatted: new Date().toLocaleTimeString()
    };

    io.to(user.room).emit('message', {
      user: user.username,
      text: msgText,
      timestamp: messageData.TimeFormatted
    });

    try {
      await docClient.send(new PutCommand({
        TableName: TABLE_NAME,
        Item: messageData
      }));
    } catch (err) {
      console.error("DB Error:", err);
    }
  });

  socket.on('typing', () => {
    const user = users[socket.id];
    if (user) socket.to(user.room).emit('typing', user.username);
  });

  socket.on('disconnect', () => {
    const user = users[socket.id];
    if (user) {
      io.to(user.room).emit('message', {
        user: 'System',
        text: `${user.username} has left.`,
        timestamp: new Date().toLocaleTimeString()
      });
      delete users[socket.id];
    }
  });
});

server.listen(80, () => {
  console.log('Server running on port 80');
});