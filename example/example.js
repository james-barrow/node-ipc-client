var net = require('net');
var os = require('os');
var events = require('events');

var ipc = require('../ipc');

var L = console.log;

ipc_one = ipc.getEvents()

ipc_one.on('connected', function (m) {

  L("Client has connected")


});


ipc_one.on('data', function (m) {

  L(m.type)
  L(m.data.toString())

});

ipc_one.on('error', function (data) {
  L(data.toString());
});

ipc_one.on('close', function (data) {
  L(data.toString());
});

ipc.connect("testtest", true)


var a = setInterval(myTimer, 1000);
function myTimer() {

  if (ipc.status() == "Closed") {
    clearInterval(a)
    clearInterval(b)
  }

  L('Connecton status: ' + ipc.status())

  ipc.write(1, "Hello server")


}

var b = setInterval(myTimerw, 8000);
function myTimerw() {
 // ipc.close()
 // clearInterval(myTimerw)
}
