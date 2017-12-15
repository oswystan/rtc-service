(function(){
    var logi = console.info;
    var logw = console.warn;
    var loge = console.error;
    var logd = console.debug;

    let ws = new WebSocket("ws://" + location.host + "/webrtc");

    function create_recver(msg) {
        logi("create_recver: ", msg);
    }
    function create_sender(msg) {
        logi("create_sender: ", msg);
    }
    function destroy_recver(msg) {
        logi("destroy_recver:", msg);
    }
    function destroy_sender(msg) {
        logi("destroy_sender:", msg);
    }
    function setanswer(msg) {
        logi("setanswer:", msg);
    }
    function bad_request(msg) {
        loge("bad_request");
    }

    let handlers = Object.create(null);
    handlers["request_create_rtcreceiver"] = create_recver;
    handlers["request_create_rtcsender"] = create_sender;
    handlers["request_destroy_rtcreceiver"] = destroy_recver;
    handlers["request_destroy_rtcsender"] = destroy_sender;
    handlers["request_setanswer_rtcsender"] = setanswer;

    ws.onopen = function() {
        $("#info").html("ws opened.");
    };
    ws.onclose = function() {
        $("#info").html("ws closed");
    };
    ws.onmessage = function(e) {
        let msg = JSON.parse(e.data);
        let command = msg.type + "_" + msg.action + "_" + msg.service;
        let handler = handlers[command];
        if (handler) {
            handler(msg);
        } else {
            bad_request(msg);
        }
    };
}());