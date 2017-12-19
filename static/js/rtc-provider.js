(function(){
    var logi = console.info;
    var logw = console.warn;
    var loge = console.error;
    var logd = console.log;

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
        refresh_status();
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
        refresh_status();
        return ws && ws.send(JSON.stringify(resp));
    }
    function findpc(which, id) {
        for (var i = 0; i < which.length; i++) {
            if (which[i]._genid === id) return which[i];
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
                logd("create receiver:", pc._genid);
            }
        };

        pc.setRemoteDescription(msg.sdp);
        pc.createAnswer().then(function(sdp){
            pc.setLocalDescription(sdp);
        }).catch(function(e) {fail(msg, e);});
    }
    function create_sender(msg) {
        logi("create_sender: ", msg);
        let src = findpc(recvers, msg.sourceid);
        let pc = new PC(rtccfg);

        pc.onicegatheringstatechange = function() {
            if (pc.iceGatheringState === "complete") {
                pc._genid = gen_id();
                senders.push(pc);
                succ(msg, {id: pc._genid, sdp: pc.localDescription});
                logd("create sender:", pc._genid);
            }
        };
        function addstream(stream) {
            stream.getTracks().forEach(track => pc.addTrack(track, stream));
            pc.createOffer({offerToReceiveVideo: false, offerToReceiveAudio: false})
                .then(function(sdp) {
                    pc.setLocalDescription(sdp);
                })
                .catch(function(e){ fail(msg, e); });
        }

        if (!src) {
            logi("create new sender by local stream");
            MD.getUserMedia({audio:true, video:true}).then(function(stream) {
                addstream(stream);
            }).catch(function(e) {
                loge("fail to get user media", e);
                fail(msg, e);
            });
        } else {
            addstream(src.getRemoteStreams()[0]);
        }
    }
    function destroy_recver(msg) {
        let src = findpc(recvers, msg.id);
        if (!src) return fail(msg, {code: -1, message:"can not to find source " + msg.id});
        recvers.splice(recvers.indexOf(src), 1);
        close_stream(src.getRemoteStreams());
        close_stream(src.getLocalStreams());
        src.close();
        logi("destroy receiver:", msg.id);
        succ(msg, {id: msg.id});
    }
    function destroy_sender(msg) {
        let src = findpc(senders, msg.id);
        if (!src) return fail(msg, {code: -1, message:"can not to find source " + msg.id});
        senders.splice(senders.indexOf(src), 1);
        close_stream(src.getRemoteStreams());
        close_stream(src.getLocalStreams());
        src.close();
        logi("destroy receiver:", msg.id);
        succ(msg, {id: msg.id});
    }
    function setanswer(msg) {
        logi("setanswer:", msg.id);
        let src = findpc(senders, msg.id);
        if (!src) return fail(msg, {code: -1, message:"can not to find source " + msg.id});
        src.setRemoteDescription(msg.sdp);
        succ(msg, { id: msg.id });
    }
    function bad_request(msg) {
        loge("bad_request");
        fail(msg, {code: -1, message:"bad request "});
    }

    function gen_id() {return ""+Math.floor(Math.random()*1e12); };
    function close_stream(s) {
        for(let stream of s) {
            stream.getTracks().forEach(track => track.stop());
        }
    }

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
    };
}());
