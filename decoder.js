self.Module = {
    onRuntimeInitialized: function () {
        onWasmLoaded();
    }
};

self.importScripts("common.js");
self.importScripts("libffmpeg.js");

function Decoder() {
    this.logger             = new Logger("Decoder");
    this.wasmLoaded         = false;
    this.cacheBuffer        = null;
    this.decodeTimer        = null;
    this.videoCallback      = null;
    this.audioCallback      = null;
    this.paramCallback      = null;
    this.requestCallback    = null;
    this.handler            = null;
}

Decoder.prototype.initDecoder = function (videoCodec) {
//	this.handler = Module._initDecoder(videoCodec, width, height, fps, this.videoCallback);
    this.handler = Module._initDecoder(videoCodec, this.videoCallback, this.paramCallback);
	if (0/*null*/ == this.handler) {
		this.logger.logInfo("initDecoder failed!");
	} else {
		this.cacheBuffer = Module._malloc(2 * 1024 * 1024);  //aEncodedFrameSize
	}
};

Decoder.prototype.uninitDecoder = function () {
	if (this.handler != 0/*null*/) {
        Module._uninitDecoder(this.handler);
        this.handler = null;
    }
    if (this.cacheBuffer != null) {
        Module._free(this.cacheBuffer);
        this.cacheBuffer = null;
    }
    
    var objData = {
        t: kUninitDecoderRsp
    };
    self.postMessage(objData);
};

Decoder.prototype.decode = function (data) {
	if (this.handler != 0/*null*/) {
		Module.HEAPU8.set(data, this.cacheBuffer);
    	Module._decodeOnePacket(this.handler, this.cacheBuffer, data.length);
	}
};

Decoder.prototype.processReq = function (req) {
    switch (req.t) {
        case kInitDecoderReq:
//          this.initDecoder(req.type, req.width, req.height, req.fps);
            this.initDecoder(req.type);
            break;
        case kUninitDecoderReq:
        	this.uninitDecoder();
            break;
        case kFeedDataReq:
        	this.decode(req.data);
            break;
        default:
            this.logger.logError("Unsupport messsage " + req.t);
    }
};

Decoder.prototype.onWasmLoaded = function () {
    this.logger.logInfo("Wasm loaded.");
    this.wasmLoaded = true;

    this.videoCallback = Module.addFunction(function (buff, size, timestamp) {
        var outArray = Module.HEAPU8.subarray(buff, buff + size);
        var data = new Uint8Array(outArray);
        var objData = {
            t: kVideoFrame,
            s: timestamp,
            d: data
        };
        self.postMessage(objData, [objData.d.buffer]);
    }, 'viid');
    
    this.paramCallback = Module.addFunction(function (width, height) {
        var objData = {
            t: kParamData,
            w: width,
            h: height
        };
        self.postMessage(objData);
    }, 'vii');
};

self.decoder = new Decoder;

self.onmessage = function (evt) {
    if (!self.decoder) {
        console.log("[ER] Decoder not initialized!");
        return;
    }

    var req = evt.data;
    if (!self.decoder.wasmLoaded) {
        self.decoder.logger.logInfo("Temp cache req " + req.t + ".");
        return;
    }

    self.decoder.processReq(req);
};

function onWasmLoaded() {
    if (self.decoder) {
        self.decoder.onWasmLoaded();
    } else {
        console.log("[ER] No decoder!");
    }
}
