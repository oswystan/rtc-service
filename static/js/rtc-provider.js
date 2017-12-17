(function(){
    var logi = console.info;
    var logw = console.warn;
    var loge = console.error;
    var logd = console.debug;

    let PC = RTCPeerConnection;
    let MD = navigator.mediaDevices;
    let rtccfg = {iceServers: [{ urls:[ "stun:stun.ekiga.net" ] }]};

    let ws = new WebSocket("ws://" + location.host + "/webrtc");

    let recvers = [];
    let senders = [];
    let server_status = "";
    function refresh_status() {
        $("#server_status").html("status:["+server_status+"]");
        $("#receivers").html("receivers:["+recvers.length+"]");
        $("#senders").html("senders:["+senders.length+"]");
    }

    function fail(req, e) {
        let resp = {
            "type": "response",
            "error": e.code,
            "desc": e.message,
            "action": req.action,
            "service": req.service,
        };
        return ws && ws.send(JSON.stringify(resp));
    };
    function succ(req, data) {
        let resp = {
            "type": "response",
            "error": 0,
            "desc": "",
            "action": req.action,
            "service": req.service,
            "data": data
        };
        return ws && ws.send(JSON.stringify(resp));
    }
    function findsrc(id) {
        for (var i = 0; i < recvers.length; i++) {
            if (recvers[i]._genid === id) return recvers[i];
        }
        return null;
    }
    function create_recver(msg) {
        logi("create_recver: ", msg);
        let pc = new PC(rtccfg);
        pc.onicegatheringstatechange = function() {
            if (pc.iceGatheringState === "complete") {
                pc._genid = gen_id();
                recvers.push(pc);
                succ(msg, {id: pc._genid, sdp: pc.localDescription});
            }
        };

        pc.setRemoteDescription(msg.sdp);
        pc.createAnswer().then(function(sdp){
            pc.setLocalDescription(sdp);
        }).catch(function(e) {fail(msg, e);});
    }
    function create_sender(msg) {
        logi("create_sender: ", msg);
        let pc = new PC(rtccfg);
        let src = findsrc(msg.sourceid);
        if (!src) return fail(msg, {code: -1, message:"fail to find source " + msg.sourceid});

        pc.onicegatheringstatechange = function() {
            if (pc.iceGatheringState === "complete") {
                pc._genid = gen_id();
                senders.push(pc);
                succ(msg, {id: pc._genid, sdp: pc.localDescription});
            }
        };

        src.getTracks().forEach(track => pc.addTrack(track, src.getRemoteStreams()[0]));
        pc.createOffer({offerToReceiveVideo: false, offerToReceiveAudio: false})
            .then(function(sdp) {
                pc.setLocalDescription(sdp);
            })
            .catch(function(e){ fail(msg, e); });
    }
    function destroy_recver(msg) {
        logi("destroy_recver:", msg);
    }
    function destroy_sender(msg) {
        logi("destroy_sender:", msg);
    }
    function setanswer(msg) {
        logi("setanswer:", msg);
        let src = findsrc(msg.id);
        if (!src) return fail(msg, {code: -1, message:"fail to find source " + msg.id});
        src.setRemoteDescription(msg.sdp);
        succ(msg, { id: msg.id });
    }
    function bad_request(msg) {
        loge("bad_request");
    }

    function gen_id() {return ""+Math.floor(Math.random()*1e12); };

    let handlers = Object.create(null);
    handlers["request_create_rtcreceiver"] = create_recver;
    handlers["request_create_rtcsender"] = create_sender;
    handlers["request_destroy_rtcreceiver"] = destroy_recver;
    handlers["request_destroy_rtcsender"] = destroy_sender;
    handlers["request_setanswer_rtcsender"] = setanswer;

    ws.onopen = function() {
        server_status = "OPEN";
        refresh_status();
    };
    ws.onclose = function() {
        server_status = "CLOSE";
        refresh_status();
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
        refresh_status();
    };
}());