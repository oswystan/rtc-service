(function(){
    var logi = console.info;
    var logw = console.warn;
    var loge = console.error;
    var logd = console.log;

    const ERROR = {
        SUCC  : 0,
        ENOSR : 1,
        ESRV  : 2,
        EPERM : 3,
    };

    let PC = RTCPeerConnection;
    let MD = navigator.mediaDevices;
    // let rtccfg = {iceServers: [{ urls:[ "stun:stun.xten.com" ] }]};
    let rtccfg = {};

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
        loge(e);
        let resp = {
            "type"    : "response",
            "error"   : e.code,
            "desc"    : e.message,
            "action"  : req.action,
            "service" : req.service,
        };
        refresh_status();
        return ws && ws.send(JSON.stringify(resp));
    };
    function succ(req, data) {
        let resp = {
            "type"    : "response",
            "error"   : 0,
            "desc"    : "",
            "action"  : req.action,
            "service" : req.service,
            "data"    : data
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
        function create_answer() {
            pc.createAnswer().then(function(sdp){
                pc.setLocalDescription(sdp);
            }).catch(function(e) {fail(msg, e);});
        }

        if (msg.sdp) {
            pc.setRemoteDescription(msg.sdp)
                .then(create_answer)
                .catch((e)=>fail(msg, e));

        } else {
            pc.createOffer({offerToReceiveVideo: msg.video, offerToReceiveAudio: msg.audio})
                .then(sdp => pc.setLocalDescription(sdp))
                .catch(e => fail(msg, e));
        }

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
        function create_answer() {
            pc.createAnswer()
                .then(sdp => pc.setLocalDescription(sdp))
                .catch(e => fail(msg, e));
        }
        function addstream(stream) {
            //only add the required track(s)
            stream.getTracks().forEach(track => {
                if(msg.audio && track.kind === "audio") pc.addTrack(track, stream);
                if(msg.video && track.kind === "video") pc.addTrack(track, stream);
            });
            if(!msg.sdp) {
                logd("create sender offer...");
                pc.createOffer({offerToReceiveVideo: false, offerToReceiveAudio: false})
                    .then(sdp => pc.setLocalDescription(sdp))
                    .catch( e => fail(msg, e));
            } else {
                logd("create sender answer with: ", msg.sdp);
                pc.setRemoteDescription(msg.sdp)
                    .then(create_answer)
                    .catch((e)=>fail(msg, e));
            }

        }

        if (!src) {
            logi("create new sender by local stream");
            MD.getUserMedia({audio:msg.audio, video:msg.video}).then(function(stream) {
                addstream(stream);
            }).catch(function(e) {
                fail(msg, e);
            });
        } else {
            logi("create sender from: ", msg.sourceid);
            addstream(src.getRemoteStreams()[0]);
        }
    }
    function destroy_recver(msg) {
        let src = findpc(recvers, msg.id);
        if (!src) return fail(msg, {code: ERROR.ENOSR, message:"can not to find source " + msg.id});
        recvers.splice(recvers.indexOf(src), 1);
        close_pc(src);
        logi("destroy receiver:", msg.id);
        succ(msg, {id: msg.id});
    }
    function destroy_sender(msg) {
        let src = findpc(senders, msg.id);
        if (!src) return fail(msg, {code: ERROR.ENOSR, message:"can not to find source " + msg.id});
        senders.splice(senders.indexOf(src), 1);
        close_pc(src);
        logi("destroy sender:", msg.id);
        succ(msg, {id: msg.id});
    }
    function set_answer(msg) {
        logi("set_answer:", msg.id, msg);
        let src = findpc(senders, msg.id) || findpc(recvers, msg.id);
        if (!src) return fail(msg, {code: -1, message:"can not to find source " + msg.id});
        src.setRemoteDescription(msg.sdp);
        succ(msg, {id: msg.id});
    }
    function bad_request(msg) {
        loge("BAD REQUEST:", msg);
        fail(msg, {code: ERROR.EPERM, message:"bad request"});
    }

    function gen_id() { return Math.random().toString(10).substring(2); }
    function close_stream(s) {
        for(let stream of s) {
            stream.getTracks().forEach(track => track.stop());
        }
    }
    function close_pc(pc) {
        close_stream(pc.getRemoteStreams());
        close_stream(pc.getLocalStreams());
        pc.getSenders().forEach(sender => pc.removeTrack(sender));
        pc.close();
    }

    let handlers = Object.create(null);
    handlers["request_create_rtcreceiver"] = create_recver;
    handlers["request_create_rtcsender"] = create_sender;
    handlers["request_destroy_rtcreceiver"] = destroy_recver;
    handlers["request_destroy_rtcsender"] = destroy_sender;
    handlers["request_setanswer_"] = set_answer;

    ws.onopen = function() {
        server_status = "OPEN";
        refresh_status();
    };
    ws.onclose = function() {
        server_status = "CLOSE";
        senders.forEach(pc => close_pc(pc));
        recvers.forEach(pc => close_pc(pc));
        senders.splice(0);
        recvers.splice(0);
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
