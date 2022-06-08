//Player request.
const kPlayVideoReq         = 0;
const kPauseVideoReq        = 1;
const kStopVideoReq         = 2;

//Player response.
const kPlayVideoRsp         = 0;
const kAudioInfo            = 1;
const kVideoInfo            = 2;
const kAudioData            = 3;
const kVideoData            = 4;

//Downloader request.
const kGetFileInfoReq       = 0;
const kDownloadFileReq      = 1;
const kCloseDownloaderReq   = 2;

//Downloader response.
const kGetFileInfoRsp       = 0;
const kFileData             = 1;

//Downloader Protocol.
const kProtoHttp            = 0;
const kProtoWebsocket       = 1;

//Decoder request.
const kInitDecoderReq       = 0;
const kUninitDecoderReq     = 1;
const kOpenDecoderReq       = 2;
const kCloseDecoderReq      = 3;
const kFeedDataReq          = 4;
const kStartDecodingReq     = 5;
const kPauseDecodingReq     = 6;
const kSeekToReq            = 7;

//Decoder response.
const kInitDecoderRsp       = 0;
const kUninitDecoderRsp     = 1;
const kOpenDecoderRsp       = 2;
const kCloseDecoderRsp      = 3;
const kVideoFrame           = 4;
const kAudioFrame           = 5;
const kStartDecodingRsp     = 6;
const kPauseDecodingRsp     = 7;
const kDecodeFinishedEvt    = 8;
const kRequestDataEvt       = 9;
const kSeekToRsp            = 10;
const kParamData            = 11;

//Video codec type
const videoCodecH264        = 0;
const videoCodecH265        = 1;

const aEncodedFrameSize     = 2 * 1024 * 1024;

//Player states.
const playerStateIdle           = 0;
const playerStatePlaying        = 1;
const playerStateClosing        = 2;

function Logger(module) {
    this.module = module;
}

Logger.prototype.log = function (line) {
    console.log("[" + this.currentTimeStr() + "][" + this.module + "]" + line);
}

Logger.prototype.logError = function (line) {
    console.log("[" + this.currentTimeStr() + "][" + this.module + "][ER] " + line);
}

Logger.prototype.logInfo = function (line) {
    console.log("[" + this.currentTimeStr() + "][" + this.module + "][IF] " + line);
}

Logger.prototype.logDebug = function (line) {
    console.log("[" + this.currentTimeStr() + "][" + this.module + "][DT] " + line);
}

Logger.prototype.currentTimeStr = function () {
    var now = new Date(Date.now());
    var year = now.getFullYear();
    var month = now.getMonth() + 1;
    var day = now.getDate();
    var hour = now.getHours();
    var min = now.getMinutes();
    var sec = now.getSeconds();
    var ms = now.getMilliseconds();
    return year + "-" + month + "-" + day + " " + hour + ":" + min + ":" + sec + ":" + ms;
}

function Texture(gl) {
    this.gl = gl;
    this.texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
}

Texture.prototype.bind = function (n, program, name) {
    var gl = this.gl;
    gl.activeTexture([gl.TEXTURE0, gl.TEXTURE1, gl.TEXTURE2][n]);
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.uniform1i(gl.getUniformLocation(program, name), n);
};

Texture.prototype.fill = function (width, height, data) {
    var gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.LUMINANCE, width, height, 0, gl.LUMINANCE, gl.UNSIGNED_BYTE, data);
};

function WebGLPlayer(canvas, options) {
    this.canvas = canvas;
    this.gl = canvas.getContext("webgl") || canvas.getContext("experimental-webgl");
    this.initGL(options);
}

WebGLPlayer.prototype.initGL = function (options) {
    if (!this.gl) {
        console.log("[ER] WebGL not supported.");
        return;
    }
    
    var gl = this.gl;
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    var program = gl.createProgram();
    var vertexShaderSource = [
        "attribute highp vec4 aVertexPosition;",
        "attribute vec2 aTextureCoord;",
        "varying highp vec2 vTextureCoord;",
        "void main(void) {",
        " gl_Position = aVertexPosition;",
        " vTextureCoord = aTextureCoord;",
        "}"
    ].join("\n");
    var vertexShader = gl.createShader(gl.VERTEX_SHADER);
    gl.shaderSource(vertexShader, vertexShaderSource);
    gl.compileShader(vertexShader);
    var fragmentShaderSource = [
        "precision highp float;",
        "varying lowp vec2 vTextureCoord;",
        "uniform sampler2D YTexture;",
        "uniform sampler2D UTexture;",
        "uniform sampler2D VTexture;",
        "const mat4 YUV2RGB = mat4",
        "(",
        " 1.1643828125, 0, 1.59602734375, -.87078515625,",
        " 1.1643828125, -.39176171875, -.81296875, .52959375,",
        " 1.1643828125, 2.017234375, 0, -1.081390625,",
        " 0, 0, 0, 1",
        ");",
        "void main(void) {",
        " gl_FragColor = vec4( texture2D(YTexture, vTextureCoord).x, texture2D(UTexture, vTextureCoord).x, texture2D(VTexture, vTextureCoord).x, 1) * YUV2RGB;",
        "}"
    ].join("\n");
    
    var fragmentShader = gl.createShader(gl.FRAGMENT_SHADER);
    gl.shaderSource(fragmentShader, fragmentShaderSource);
    gl.compileShader(fragmentShader);
    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);
    gl.useProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        console.log("[ER] Shader link failed.");
    }
    var vertexPositionAttribute = gl.getAttribLocation(program, "aVertexPosition");
    gl.enableVertexAttribArray(vertexPositionAttribute);
    var textureCoordAttribute = gl.getAttribLocation(program, "aTextureCoord");
    gl.enableVertexAttribArray(textureCoordAttribute);
    
    var verticesBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, verticesBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([1.0, 1.0, 0.0, -1.0, 1.0, 0.0, 1.0, -1.0, 0.0, -1.0, -1.0, 0.0]), gl.STATIC_DRAW);
    gl.vertexAttribPointer(vertexPositionAttribute, 3, gl.FLOAT, false, 0, 0);
    var texCoordBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, texCoordBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([1.0, 0.0, 0.0, 0.0, 1.0, 1.0, 0.0, 1.0]), gl.STATIC_DRAW);
    gl.vertexAttribPointer(textureCoordAttribute, 2, gl.FLOAT, false, 0, 0);
    
    gl.y = new Texture(gl);
    gl.u = new Texture(gl);
    gl.v = new Texture(gl);
    gl.y.bind(0, program, "YTexture");
    gl.u.bind(1, program, "UTexture");
    gl.v.bind(2, program, "VTexture");
}

WebGLPlayer.prototype.renderFrame = function (videoFrame, width, height, uOffset, vOffset) {
    if (!this.gl) {
        console.log("[ER] Render frame failed due to WebGL not supported.");
        return;
    }
    
    var gl = this.gl;
    gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
    gl.clearColor(0.0, 0.0, 0.0, 0.0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    
    gl.y.fill(width, height, videoFrame.subarray(0, uOffset));
    gl.u.fill(width >> 1, height >> 1, videoFrame.subarray(uOffset, uOffset + vOffset));
    gl.v.fill(width >> 1, height >> 1, videoFrame.subarray(uOffset + vOffset, videoFrame.length));
    
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
};

WebGLPlayer.prototype.fullscreen = function () {
    var canvas = this.canvas;
    if (canvas.RequestFullScreen) {
        canvas.RequestFullScreen();
    } else if (canvas.webkitRequestFullScreen) {
        canvas.webkitRequestFullScreen();
    } else if (canvas.mozRequestFullScreen) {
        canvas.mozRequestFullScreen();
    } else if (canvas.msRequestFullscreen) {
        canvas.msRequestFullscreen();
    } else {
        alert("This browser doesn't supporter fullscreen");
    }
};

WebGLPlayer.prototype.exitfullscreen = function (){
    if (document.exitFullscreen) {
        document.exitFullscreen();
    } else if (document.webkitExitFullscreen) {
        document.webkitExitFullscreen();
    } else if (document.mozCancelFullScreen) {
        document.mozCancelFullScreen();
    } else if (document.msExitFullscreen) {
        document.msExitFullscreen();
    } else {
        alert("Exit fullscreen doesn't work");
    }
}


String.prototype.startWith = function(str) {
    var reg = new RegExp("^" + str);
    return reg.test(this);
};

module.exports = function Player() {
    this.url                = null;
    this.vcodec             = 0;  //videoCodecH264
    this.pixFmt             = 0;
    this.videoWidth         = 0;
    this.videoHeight        = 0;
    this.yLength            = 0;
    this.uvLength           = 0;
    this.canvas             = null;
    this.webglPlayer        = null;
    this.callback           = null;
    this.playerState        = playerStateIdle;
    this.loadingDiv         = null;
    this.firstVideoFrame    = false;
    this.frameBuffer        = [];
    this.logger             = new Logger("Player");
    this.ws                 = null;
    this.initDecodeWorker();
}

Player.prototype.initDecodeWorker = function () {
    var self = this;
    this.decodeWorker = new Worker("../decoder.js");
    this.decodeWorker.onmessage = function (evt) {
        var objData = evt.data;
        switch (objData.t) {
            case kVideoFrame:
                self.onVideoFrame(objData);
                break;
            case kParamData:
                if ((self.videoWidth != objData.w) || (self.videoHeight != objData.h)) {
//                  console.log("videoWidth: " + self.videoWidth + ", videoHeight: " + self.videoHeight + ", objData.w: " + objData.w + ", objData.h: " + objData.h);
                    self.videoWidth = objData.w;
                    self.videoHeight = objData.h;
                    self.yLength = self.videoWidth * self.videoHeight;
    			    self.uvLength = (self.videoWidth / 2) * (self.videoHeight / 2);
                }
                break;
            case kUninitDecoderRsp:
                self.playerState = playerStateIdle;
                break;
            default:
                self.logger.logError("Unsupport messsage " + objData.t);
                break;
        }
    }
};

Player.prototype.play = function (url, canvas, callback) {
    this.logger.logInfo("Play " + url + ".");

    var ret = {
        e: 0,
        m: "Success"
    };

    var success = true;
    do {
        if (this.playerState == playerStatePlaying) {
            break;
        }

        if (!url) {
            ret = {
                e: -1,
                m: "Invalid url"
            };
            success = false;
            this.logger.logError("[ER] playVideo error, url empty.");
            break;
        }

        if (!canvas) {
            ret = {
                e: -2,
                m: "Canvas not set"
            };
            success = false;
            this.logger.logError("[ER] playVideo error, canvas empty.");
            break;
        }

        if (!this.decodeWorker) {
            ret = {
                e: -4,
                m: "Decoder not initialized"
            };
            success = false;
            this.logger.logError("[ER] Decoder not initialized.");
            break
        }

        if (url.startWith("ws://") || url.startWith("wss://")) {
            this.downloadProto = kProtoWebsocket;
        } else {
            this.downloadProto = kProtoHttp;
        }

        this.canvas = canvas;
        this.callback = callback;
        this.playerState = playerStatePlaying;
        this.displayLoop();

        //var playCanvasContext = playCanvas.getContext("2d"); //If get 2d, webgl will be disabled.
        this.webglPlayer = new WebGLPlayer(this.canvas, {
            preserveDrawingBuffer: false
        });

        this.showLoading();
        this.firstVideoFrame = true;
        this.requestStream(url);
    } while (false);

    return ret;
};

Player.prototype.stop = function () {
    this.logger.logInfo("Stop.");

    this.hideLoading();

//  this.canvas             = null;
//  this.webglPlayer        = null;
//  this.callback           = null;
    this.pixFmt             = 0;
    this.videoWidth         = 0;
    this.videoHeight        = 0;
    this.yLength            = 0;
    this.uvLength           = 0;
    this.playerState        = playerStateClosing;  //playerStateIdle
    this.firstVideoFrame    = false;
    this.frameBuffer        = [];
    if (this.ws != null) {
        this.ws.onclose = function () {}; // disable onclose handler first
        this.ws.close();
        this.ws             = null;
    }
    this.decodeWorker.postMessage({
        t: kUninitDecoderReq
    });
//  this.decodeWorker       = null;
};

Player.prototype.fullscreen = function () {
    if (this.webglPlayer) {
        this.webglPlayer.fullscreen();
    }
};

Player.prototype.getState = function () {
    return this.playerState;
};

Player.prototype.bufferFrame = function (frame) {
	this.frameBuffer.push(frame);
}

Player.prototype.onVideoFrame = function (frame) {
	if (this.firstVideoFrame) {
		this.hideLoading();
		this.firstVideoFrame = false;
	}
    this.bufferFrame(frame);
};

Player.prototype.displayVideoFrame = function (frame) {
    var data = new Uint8Array(frame.d);
    this.renderVideoFrame(data);
    return true;
};

Player.prototype.displayLoop = function() {
    if (this.playerState !== playerStateIdle) {
        requestAnimationFrame(this.displayLoop.bind(this));
    }

    if (this.playerState != playerStatePlaying) {
        return;
    }

    if (this.frameBuffer.length == 0) {
        return;
    }

    // requestAnimationFrame may be 60fps, if stream fps too large,
    // we need to render more frames in one loop, otherwise display
    // fps won't catch up with source fps, leads to memory increasing,
    // set to 2 now.
    for (i = 0; i < 2; ++i) {
        var frame = this.frameBuffer[0];
        switch (frame.t) {
            case kVideoFrame:
                if (this.displayVideoFrame(frame)) {
                    this.frameBuffer.shift();
                }
                break;
            default:
                this.logger.logError("Unsupport messsage " + frame.t);
                return;
        }

        if (this.frameBuffer.length == 0) {
            break;
        }
    }
};

Player.prototype.renderVideoFrame = function (data) {
    if ((this.videoWidth > 0) && (this.videoHeight > 0)) {
        this.webglPlayer.renderFrame(data, this.videoWidth, this.videoHeight, this.yLength, this.uvLength);
    }
};

Player.prototype.setLoadingDiv = function (loadingDiv) {
    this.loadingDiv = loadingDiv;
}

Player.prototype.hideLoading = function () {
    if (this.loadingDiv != null) {
        loading.style.display = "none";
    }
};

Player.prototype.showLoading = function () {
    if (this.loadingDiv != null) {
        loading.style.display = "block";
    }
};

Player.prototype.registerVisibilityEvent = function (cb) {
    var hidden = "hidden";

    // Standards:
    if (hidden in document) {
        document.addEventListener("visibilitychange", onchange);
    } else if ((hidden = "mozHidden") in document) {
        document.addEventListener("mozvisibilitychange", onchange);
    } else if ((hidden = "webkitHidden") in document) {
        document.addEventListener("webkitvisibilitychange", onchange);
    } else if ((hidden = "msHidden") in document) {
        document.addEventListener("msvisibilitychange", onchange);
    } else if ("onfocusin" in document) {
        // IE 9 and lower.
        document.onfocusin = document.onfocusout = onchange;
    } else {
        // All others.
        window.onpageshow = window.onpagehide = window.onfocus = window.onblur = onchange;
    }

    function onchange (evt) {
        var v = true;
        var h = false;
        var evtMap = {
            focus:v,
            focusin:v,
            pageshow:v,
            blur:h,
            focusout:h,
            pagehide:h
        };

        evt = evt || window.event;
        var visible = v;
        if (evt.type in evtMap) {
            visible = evtMap[evt.type];
        } else {
            visible = this[hidden] ? h : v;
        }
        cb(visible);
    }

    // set the initial state (but only if browser supports the Page Visibility API)
    if( document[hidden] !== undefined ) {
        onchange({type: document[hidden] ? "blur" : "focus"});
    }
}

Player.prototype.requestStream = function (url) {
	this.url = url;
	
	if (this.ws == null) {
		this.ws = new WebSocket(url);
        this.ws.binaryType = 'arraybuffer';
    }

    var self = this;
    this.ws.onopen = function(evt) {
        self.logger.logInfo("Ws connected.");
        self.ws.send(self.url);
    };

    this.ws.onclose = function(evt) {
        self.logger.logInfo("Ws closed, error code: " + evt.code);
        self.ws = null;
    };

    this.ws.onerror = function(evt) {
        self.logger.logError("Ws connect error");
        self.ws = null;
    }

    this.ws.onmessage = function(evt) {
    	var req = {
    	};
    	
        var stream = new Uint8Array(evt.data);
    	
    	//F1(1) F2(2) F3(3) F4(4) state(5:0-ok) type(6:0-h264,1-h265) width(7-8) height(9-10) fps(1)
        if ((0xF1 == stream[0]) && (0xF2 == stream[1]) && (0xF3 == stream[2]) && (0xF4 == stream[3])) {  //Stream info
//          self.logger.logInfo(stream);
        	if (0 == stream[4]) {
        		req.t = kInitDecoderReq;
        		req.type = stream[5];  //0-h264, 1-h265
        		req.width = (stream[6] << 8) + stream[7];
        		req.height = (stream[8] << 8) + stream[9];
        		req.fps = stream[10];
        		console.log(stream)
        		/*
        		self.videoWidth = req.width;
    			self.videoHeight = req.height;
    			self.yLength = self.videoWidth * self.videoHeight;
    			self.uvLength = (self.videoWidth / 2) * (self.videoHeight / 2);
    			*/
    			
//    			self.playerState = playerStatePlaying;
//    			self.displayLoop();
    			self.logger.logError("Play start!");
    			
    			self.decodeWorker.postMessage(req);
        	} else {
        		self.logger.logError("Stream exception!");
        	}
        } else if (self.frameBuffer.length < 100) {  //Stream data
        	req.t = kFeedDataReq
        	req.data = stream;
        	self.decodeWorker.postMessage(req);
        }
    }
};
