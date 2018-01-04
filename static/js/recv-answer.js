/*
 *********************************************************************************
 *                     Copyright (C) 2018 wystan
 *
 *       filename: recv-answer.js
 *    description:
 *        created: 2018-01-04 17:32:02
 *         author: wystan
 *
 *********************************************************************************
 */

(function(){
    var logi = console.info;
    var logw = console.warn;
    var loge = console.error;
    var logd = console.log;

    let PC = RTCPeerConnection;
    let MD = navigator.mediaDevices;
    // let rtccfg = {iceServers: [{ urls:[ "stun:stun.xten.com" ] }]};
    let rtccfg = {};

    let lv = $('local_video');
    let rv = $('local_video');

    let recv_pc = new PC(rtccfg);
    let send_pc = new PC(rtccfg);

    function fail(e) {
        loge(e);
    }

    function create_recver() {
        recv_pc.onicegatheringstatechange = function() {
            if (recv_pc.iceGatheringState === "complete") {
                logi("recver ice success.");
                logd("offer-sdp:");
                logd(recv_pc.localDescription);
                create_sender();
            }
        };
        recv_pc.ontrack = function(e) {
            let elem = document.getElementById("remote_video");
            elem.srcObject = e.streams[0];
        };

        recv_pc.createOffer({offerToReceiveVideo: true, offerToReceiveAudio: true})
            .then(function (sdp) {
                recv_pc.setLocalDescription(sdp);
            })
            .catch(fail);
    }
    function create_sender() {
        send_pc.onicegatheringstatechange = function() {
            if (send_pc.iceGatheringState === "complete") {
                logi("sender ice success.");
                logd("answer-sdp:");
                logd(send_pc.localDescription);
                recv_pc.setRemoteDescription(send_pc.localDescription);
            }
        };

        function add_stream(stream) {
            let elem = document.getElementById("local_video");
            elem.srcObject = stream;
            stream.getTracks().forEach(track => {
                send_pc.addTrack(track, stream);
            });
            send_pc.setRemoteDescription(recv_pc.localDescription);
            send_pc.createAnswer().then(function (sdp) {
                send_pc.setLocalDescription(sdp);
            })
            .catch(fail)
        }

        MD.getUserMedia({audio:false, video:true})
            .then(add_stream)
            .catch(fail);
    }

    create_recver();

}());




/************************************* END **************************************/
