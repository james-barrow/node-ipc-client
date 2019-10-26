
var net = require('net');
var os = require('os');
var events = require('events');

const version = 1
const maxMsgSize = 3145728 // 3Mb

var name = ""
var status = 0   // NotConnected = 0, Connecting  = 1, Connected  = 2, ReConnecting = 3, Closed  = 4

var connection = net.Socket()
var events = new events.EventEmitter()

exports.getEvents = function () {

    return events
}

exports.connect = function (ipcName) {

    if (ipcName == null) {
        events.emit('error', "ipcName name is undefined");
        return events
    }

    if (typeof ipcName != 'string') {
        events.emit('error', "ipcName name is not a string");
        return events
    }

    if (ipcName.length == 0) {
        events.emit('error', "ipcName name cannot be empty");
        return events
    }

    status = 1

    if (os.platform() === 'win32') {
        namedPipe()
    } else {
        unixSocket()
    }

    name = ipcName

}

exports.write = function (msgType, data) {

    if (status == 2) {

        if (typeof (data) == 'string') {
            var toSend = Buffer.from(data)
        } else if (Buffer.isBuffer(data) == true) {
            var toSend = data
        } else {
            events.emit('error', "write - data to send must be a string or Buffer");
            return
        }

        if (toSend.length > maxMsgSize) {
            events.emit('error', "write - data passed in is greater than the maxMsgSize");
            return
        }

        header = createHeader(msgType, toSend.length)
        if (header != null) {
            try {
                connection.write(Buffer.concat([header, toSend]))
                return true
            } catch (e) {
                events.emit('error', "write - error writing message " + e);
            }

        }
    } else {
        return false
    }

}

exports.close = function () {

    connection.end()
    status = 4

}

exports.status = function () {

    if (status == 0) {
        return "Not Connected"
    }

    if (status == 1) {
        return "Connecting"
    }


    if (status == 2) {
        return "Connected"
    }


    if (status == 3) {
        return "Re-Connecting"
    }


    if (status == 4) {
        return "Closed"
    }

}

function namedPipe(ipcConfig) {

    var PIPE_PATH = "\\\\.\\pipe\\" + name;

    connection = net.connect(PIPE_PATH, function () {

        if (status != 4) {
            events.emit('connected', "connection has established");
            status = 2
        } else {
            connection.end()
        }

    })

    connection.on('readable', () => {

        header = connection.read(9)  // read header, process header, get number of bytes in message

        if (header != null) {

            message = processHeader(header)

            if (message != null) {
                message.data = connection.read(message.length) // read the message data
            }

            events.emit('data', message);

        }
    })

    connection.on('end', function () {
        if (status != 4) {
            if (status == 2) {
                status = 3
            }
            namedPipe()
        } else {
            events.emit('close', "connection has closed");
        }
    })

    connection.on('error', function (error) {
        if (status != 4) {
            if (status == 2) {
                status = 3
            }
            setTimeout(() => {
                namedPipe()
            }, 2000)
        } else {
            events.emit('close', "connection has closed");
        }
    });
}

function unixSocket() {

    var base = '/tmp/'
    var sock = '.sock'

    connection = net.createConnection(base + name + sock)
        .on('connect', () => {
            if (status != 4) {
                events.emit('connected', "connection has established");
                status = 2
            } else {
                connection.end()
            }
        })

    connection.on('readable', () => {

        header = connection.read(9)  // read header, process header, get number of bytes in message

        if (header != null) {

            message = processHeader(header)

            if (message != null) {
                message.data = connection.read(message.length)
            }

            events.emit('data', message);
        }
    })

    connection.on('end', function () {
        if (status != 4) {
            if (status == 2) {
                status = 3
            }
            unixSocket()
        } else {
            events.emit('close', "connection has been closed");
        }
    })

    connection.on('error', function (error) {
        if (status != 4) {
            if (status == 2) {
                status = 3
            }
            setTimeout(() => {
                unixSocket()
            }, 1000)
        } else {
            events.emit('close', "connection has been closed");
        }
    });
}

function processHeader(d) {

    var message = {
        version: d[0],
        type: d.slice(1, 5).readUInt32BE(),
        length: Buffer.alloc(4),
        data: new ArrayBuffer()
    };

    if (message.version != version) {
        events.emit('error', "read - Server sent wrong version number");
        return null;
    }


    message.length = d.slice(5, 9).readUInt32BE()

    return message;

}

function createHeader(msgType, msgLength) {

    if (typeof (msgType) != 'number') {
        events.emit('error', "write - msgType has to be a number");
        return null
    }

    if (msgType == 0) {
        events.emit('error', "write - 0 is not allowed as msgType")
        return
    }

    var buf = Buffer.alloc(9);
    buf[0] = version
    buf.writeUInt32BE(msgType, 1);
    buf.writeUInt32BE(msgLength, 5);

    return buf
}

