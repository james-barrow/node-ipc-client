const { app, BrowserWindow , session} = require('electron')

const url = require('url')
const path = require('path')
const { ipcMain } = require('electron')

var net = require('net');
var os = require('os');
var events = require('events');
var ipc = require('../../ipc');
var L = console.log;

let mainWindow

function ipcMessaging() {

  ipc_one = ipc.getEvents()

  ipc_one.on('data', function (m) {
    // recieve the counter number from the go process and send it to the main window
    if (m.type == 5) {

      if (mainWindow != null) {
        mainWindow.webContents.send('counter', m.data.toString())
      }
    }

  });

  ipc_one.on('error', function (data) {
    L(data.toString());
  });

  ipc_one.on('connect', function (data) {
    // send the change of status to the main window
    if (mainWindow != null) {
      mainWindow.webContents.send('status', "Connected")
    }
  });

  ipc_one.on('close', function (data) {
    // send the change of status to the main window
    if (mainWindow != null) {
      mainWindow.webContents.send('status', "Disconnected")
    }
  });

  ipc.connect("testtest", null)

}

function recieveMessagesFromMainWindow() {
  // recieve the reset button event and send it to the go process
  ipcMain.on('reset', (event) => {

    ipc.write(20, "reset")

    event.returnValue = 'ok'
  })
  // recieve the set button event and the value of the input box,
  // send the input box value to the go process so it can use it set the counter value.
  ipcMain.on('set', (event, val) => {

    ipc.write(21, val)

    event.returnValue = 'ok'
  })

}

function createWindow() {

  mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      nodeIntegration: true
      // allowRunningInsecureContent: true
    }

  })

  mainWindow.loadURL(url.format({
    pathname: path.join(__dirname, 'index.html'),
    protocol: 'file:',
    slashes: true
  }))

  // Open the DevTools.
  mainWindow.webContents.openDevTools()

  mainWindow.on('closed', () => {
    mainWindow = null
  })

  mainWindow.webContents.on('did-finish-load', () => {

    recieveMessagesFromMainWindow()
    ipcMessaging()

  })

}

app.on('ready', createWindow)

app.on('window-all-closed', () => {

  //if (process.platform !== 'darwin') {
  app.quit()
  //}
})

app.on('activate', () => {
  if (mainWindow === null) {
    createWindow()
  }
})
