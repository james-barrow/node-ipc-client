var net = require('net');
var os = require('os');
var events = require('events');
const crypto = require('crypto');

const version = 2
var maxMsgSize

var name = ""
var status = 0   // NotConnected = 0, Connecting  = 1, Connected  = 2, ReConnecting = 3, Closed  = 4

var connection = net.Socket()
var events = new events.EventEmitter()
var handshakeStatus = 0
var enforceEncryption = true
var encryptionActive = false
var sharedKey

exports.getEvents = function () {

    return events
}

exports.connect = function (ipcName, encryption) {

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

    if (encryption == false) {
        enforceEncryption = false
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
            var message = Buffer.from(data)
        } else if (Buffer.isBuffer(data) == true) {
            var message = data
        } else {
            events.emit('error', "write - data to send must be a string or Buffer");
            return
        }

        if (message.length > maxMsgSize) {
            events.emit('error', "write - data passed in is greater than the maxMsgSize");
            return
        }

        var mType = intToBytes(msgType)

        if (encryptionActive == false) {
            var mLen = intToBytes(Buffer.concat([mType, message]).length)
            var toSend = Buffer.concat([mLen, mType, message])
        } else {

            var encBuf = encrypt(Buffer.concat([mType, message]))
            var mLen = intToBytes(encBuf.length)
            var toSend = Buffer.concat([mLen, encBuf])

        }

        try {
            connection.write(toSend)
            return true
        } catch (e) {
            events.emit('error', "write - error writing message " + e);
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
           // events.emit('connected', "connection has established");
        } else {
            connection.end()
        }

    })

    connection.on('readable', () => {

        readRecieved(connection)

    })

    connection.on('end', function () {
        connectionClosed()
    })

    connection.on('error', function (error) {
        connectionClosed()
    });
}

function unixSocket() {

    var base = '/tmp/'
    var sock = '.sock'

    connection = net.createConnection(base + name + sock)
        .on('connect', () => {
            if (status != 4) {
                //events.emit('connected', "connection has established");
            } else {
                connection.end()
            }
        })

    connection.on('readable', () => {

        readRecieved(connection)

    })

    connection.on('end', function () {
        connectionClosed()
    })

    connection.on('error', function (error) {
        connectionClosed()
    });
}

function connectionClosed() {

    if (status != 4) {
        if (status == 2) {
            status = 3
            handshakeStatus = 0
            encryptionActive = false
            sharedKey = ""
            events.emit('close', "connnection has closed");
        }

        if (os.platform() === 'win32') {
            namedPipe()
        } else {
            unixSocket()
        }


    } else {
        events.emit('close', "connection has been closed");
    }

}

function getMsgLength(d) {

    if (d == null) {
        return null
    }

    if (d.length != 4) {
        events.emit('error', "Message length recived is the wrong length");
        return false
    }

    var mLen = d.readUInt32BE()

    if (isNaN(mLen)) {
        events.emit('error', "Message length recived is not a number");
        return false
    }

    return mLen

}

function readRecieved(connnection) {

    if (handshakeStatus != 5) {
        if (handshake(connection.read()) == false) {
            status = 0
            connection.end()
        }
    } else {

        var mLen = getMsgLength(connection.read(4))

        if (mLen != null) {
            processMessage(connection.read(mLen))
        }
    }

}

function processMessage(data) {

    if (data.length < 5) {
        events.emit('error', "Message recieved is to short");

    } else {

        var data2 = new ArrayBuffer()

        if (encryptionActive == true) {

            data2 = decrypt(data)
        } else {
            data2 = data
        }

        var message = {
            type: data2.slice(0, 4).readUInt32BE(),
            data: data2.slice(4)
        };

        events.emit('data', message);

    }
}

function handshake(d) {

    // 0 get version and encyption
    // 1 send 1 byte = recvd 0
    // 2 get public from server
    // 3 send public to server
    // 4 get max msg length
    // 5 send back 1 byte reply

    switch (handshakeStatus) {
        case 0:  // recieved version and enc
            if (one(d) == false) {
                handshakeStatus = 0
                return false
            } else {
                if (enforceEncryption == false) {
                    handshakeStatus = 4
                } else {
                    handshakeStatus = 2
                }
                return true
            }
            break;
        case 2: // recieved public key from server
            if (keyExchange(d) == true) {
                handshakeStatus = 4
                return true
            }
            break;
        case 4: // recieved max message length
            if (msgLength(d) == true) {
                handshakeStatus = 5
                if (enforceEncryption == false) {
                    encryptionActive = false
                } else {
                    encryptionActive = true        
                }
                events.emit('connect', "connection has been established");
                status = 2

                return true
            }
            break;
        default:
            // unknown message recieved - throw error
            return false
    }

    return false
}

function one(d) {

    if (d == null) {
        return false
    }

    if (d.length != 2) {
        events.emit('error', "handshake message is wrong length");
        return false
    }

    var buf = Buffer.alloc(1);
    buf[0]

    if (d[0] != version) {
        buf[0] = 1
        events.emit('error', "server has sent wrong version number");
    } else {
        if (d[1] != 1 && enforceEncryption == true) {
            buf[0] = 2
            events.emit('error', "server tried to connect without encryption");
        } else {
            buf[0] = 0
        }
    }

    try {
        connection.write(buf)
    } catch (e) {
        events.emit('error', "initial hankshake message - couldn't send reply.");
        return false
    }

    if (buf[0] == 0) {
        return true
    } else {
        return false
    }

}

function keyExchange(recvdPub) {

    if (recvdPub == null) {
        return false
    }

    if (recvdPub.length != 97) {
        events.emit('error', "public key recieved is wrong length");
        return false
    }

    var key = crypto.createECDH("secp384r1");
    var pub = key.generateKeys();

    try {
        connection.write(pub)
    } catch (e) {
        events.emit('error', "couldn't send public key");
        return false
    }

    if (pub.length != 97) {
        events.emit('error', "public key created is the wrong length");
        return false
    }

    sharedKey = crypto.createHash('sha256').update(key.computeSecret(recvdPub)).digest();

    return true

}

function msgLength(d) {

    if (d == null) {
        return false
    }

    var mLen = d.slice(0, 4).readUInt32BE()

    var eMsg = d.slice(4)

    if (eMsg.length != mLen) {
        events.emit('error', "Message length data recieved is the wrong length");
        return false
    }


    if (enforceEncryption == false) {

        var mSize = eMsg

    } else {

        var mSize = decrypt(eMsg)

        if (mSize == null) {
            events.emit('error', "Unable to decrypt message length");
            return false
        }

        if (mSize.length != 4) {
            events.emit('error', "Message length data is the wrong length");
            return false
        }

    }
    maxMsgSize = mSize.slice(0, 4).readUInt32BE()

    var buf = Buffer.alloc(1);
    buf[0] = 0

    try {
        connection.write(buf)
    } catch (e) {
        events.emit('error', "handshake - unable to send message length reply.");
        return false
    }

    return true
}

function encrypt(data) {

    if (data == null) {
        return null
    }

    try {

        var iv = crypto.randomBytes(12)
        var cipher = crypto.createCipheriv("aes-256-gcm", sharedKey, iv)
        var encryptedBuffer = Buffer.concat([cipher.update(data), cipher.final()])
        var tag = cipher.getAuthTag()

        return Buffer.concat([iv, encryptedBuffer, tag])

    } catch (e) {
        events.emit('error', "Encrypt error: " + e);
        return null
    }

}


function decrypt(data) {

    var nonceSize = 12
    var gcmTagSize = 16

    var decode = Buffer.from(data)
    var nonce = decode.slice(0, nonceSize)
    var cTxt = decode.slice(nonceSize, decode.length - gcmTagSize)
    var tag = decode.slice(decode.length - gcmTagSize)
    var decipher = crypto.createDecipheriv("aes-256-gcm", sharedKey, nonce);
    decipher.setAuthTag(tag);

    try {

        return decipher.update(cTxt);
    } catch (e) {
        events.emit('error', "Decrypt error: " + e);
        return null
    }

}


function intToBytes(i) {

    var buf = Buffer.alloc(4);
    buf.writeUInt32BE(i);
    return buf

}

function bytesToInt(buf) {

    int = buf.slice(0, 4).readUInt32BE()
    return int

}

