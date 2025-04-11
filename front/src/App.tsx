// src/App.tsx
import React, { useEffect, useRef, useState } from "react";

interface SignalMessage {
  type: string;
  sdp?: string;
  candidate?: RTCIceCandidateInit;
  timestamp?: number; // 用于 ping/pong 消息测量延迟
  delay?: number;     // 用于延迟上报消息
}

const App: React.FC = () => {
  // 视频元素引用
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);

  // WebSocket 连接状态及引用
  const [wsConnected, setWsConnected] = useState<boolean>(false);
  const wsRef = useRef<WebSocket | null>(null);

  // RTCPeerConnection 引用
  const pcRef = useRef<RTCPeerConnection | null>(null);

  // 本地媒体流引用，方便断开时停止所有轨道
  const localStreamRef = useRef<MediaStream | null>(null);

  // 延迟相关状态
  const [localDelay, setLocalDelay] = useState<number | null>(null);
  const [remoteDelay, setRemoteDelay] = useState<number | null>(null);
  const [delayHistory, setDelayHistory] = useState<number[]>([]);
  // 用于标识是否已经加入通话
  const [joined, setJoined] = useState<boolean>(false);

  // 定时器引用
  const pingIntervalRef = useRef<number | null>(null);

  const iceServers = {
    iceServers: [
      { urls: "stun:stun.l.google.com:19302" }
    ]
  };

  useEffect(() => {
    // 若后端使用 TLS，则使用 wss:// 协议
    const ws = new WebSocket("wss://192.168.31.209:8765");
    wsRef.current = ws;

    ws.onopen = () => {
      console.log("WebSocket 已连接到信令服务器");
      setWsConnected(true);
      // 每秒发送一次 ping 消息，带上当前时间戳
      pingIntervalRef.current = window.setInterval(() => {
        const pingMsg: SignalMessage = {
          type: "ping",
          timestamp: Date.now(),
        };
        ws.send(JSON.stringify(pingMsg));
      }, 1000);
    };

    ws.onmessage = async (event: MessageEvent) => {
      console.log("收到信令消息:", event.data);
      let data: SignalMessage;
      try {
        data = JSON.parse(event.data);
      } catch (error) {
        console.error("消息解析失败:", error);
        return;
      }

      if (data.type === "pong" && data.timestamp) {
        const now = Date.now();
        const rtt = now - data.timestamp;
        const delay = rtt / 2; // 取单边延迟
        setLocalDelay(delay);
        // 将延迟上报给对方
        const delayReport: SignalMessage = { type: "delay-report", delay: delay };
        ws.send(JSON.stringify(delayReport));
      } else if (data.type === "delay-report" && data.delay !== undefined) {
        setRemoteDelay(data.delay);
      } else if (data.type === "offer") {
        console.log("收到 offer 消息:", data);
        if (!pcRef.current) {
          createPeerConnection();
        }
        if (pcRef.current && data.sdp) {
          try {
            await pcRef.current.setRemoteDescription(
              new RTCSessionDescription({ type: "offer", sdp: data.sdp })
            );
            const answer = await pcRef.current.createAnswer();
            await pcRef.current.setLocalDescription(answer);
            const answerMsg: SignalMessage = { type: "answer", sdp: answer.sdp };
            ws.send(JSON.stringify(answerMsg));
          } catch (error) {
            console.error("处理 offer 时出错:", error);
          }
        }
      } else if (data.type === "answer") {
        console.log("收到 answer 消息:", data);
        if (pcRef.current && data.sdp) {
          try {
            await pcRef.current.setRemoteDescription(
              new RTCSessionDescription({ type: "answer", sdp: data.sdp })
            );
          } catch (error) {
            console.error("设置远端 answer 描述时出错:", error);
          }
        }
      } else if (data.type === "candidate") {
        console.log("收到 candidate 消息:", data);
        if (pcRef.current && data.candidate) {
          try {
            await pcRef.current.addIceCandidate(new RTCIceCandidate(data.candidate));
          } catch (error) {
            console.error("添加 ICE 候选信息时出错:", error);
          }
        }
      } else if (data.type === "ping" && data.timestamp) {
        const pongMsg: SignalMessage = { type: "pong", timestamp: data.timestamp };
        ws.send(JSON.stringify(pongMsg));
      } else {
        console.warn("收到未知类型的信令消息:", data);
      }
    };

    ws.onerror = (error) => {
      console.error("WebSocket 错误:", error);
    };

    return () => {
      if (pingIntervalRef.current) {
        clearInterval(pingIntervalRef.current);
      }
      ws.close();
    };
  }, []);

  // 当 localDelay 与 remoteDelay 更新后记录当前测量值（只保留最近10次）
  useEffect(() => {
    if (localDelay !== null && remoteDelay !== null) {
      const pairDelay = localDelay + remoteDelay;
      setDelayHistory((prev) => {
        const newHistory = [...prev, pairDelay];
        if (newHistory.length > 10) {
          newHistory.shift();
        }
        return newHistory;
      });
    }
  }, [localDelay, remoteDelay]);

  // 计算最近10次延迟的平均值
  const averageDelay =
    delayHistory.length > 0
      ? delayHistory.reduce((sum, d) => sum + d, 0) / delayHistory.length
      : null;

  const createPeerConnection = () => {
    const pc = new RTCPeerConnection(iceServers);
    pcRef.current = pc;

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        console.log("发送 ICE 候选:", event.candidate);
        const candidateMsg: SignalMessage = {
          type: "candidate",
          candidate: event.candidate.toJSON(),
        };
        wsRef.current?.send(JSON.stringify(candidateMsg));
      }
    };

    pc.ontrack = (event) => {
      console.log("收到远端媒体流:", event);
      if (remoteVideoRef.current && event.streams && event.streams[0]) {
        remoteVideoRef.current.srcObject = event.streams[0];
      }
    };
  };

  // 加入通话：获取本地媒体流、创建 PeerConnection 并发送 offer
  const joinCall = async () => {
    console.log("加入通话按钮点击");
    let localStream: MediaStream;
    try {
      localStream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true
      });
      console.log("获取到本地流", localStream);
    } catch (error) {
      console.error("获取媒体流失败:", error);
      return;
    }
    // 保存本地媒体流引用，方便断开时使用
    localStreamRef.current = localStream;

    if (localVideoRef.current) {
      localVideoRef.current.srcObject = localStream;
    }
    if (!pcRef.current) {
      createPeerConnection();
    }
    localStream.getTracks().forEach((track) => {
      pcRef.current?.addTrack(track, localStream);
    });
    try {
      const offer = await pcRef.current!.createOffer();
      await pcRef.current!.setLocalDescription(offer);
      const offerMsg: SignalMessage = { type: "offer", sdp: offer.sdp };
      console.log("发送 offer 消息", offerMsg);
      wsRef.current?.send(JSON.stringify(offerMsg));
      // 标记自己已经加入通话
      setJoined(true);
    } catch (error) {
      console.error("创建或发送 offer 时出错:", error);
    }
  };

  // 断开通话：停止本地媒体、关闭 PeerConnection、清空视频
  const disconnectCall = () => {
    console.log("断开通话按钮点击");
    // 停止本地媒体流所有轨道
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => track.stop());
      localStreamRef.current = null;
    }
    // 清空视频显示
    if (localVideoRef.current) {
      localVideoRef.current.srcObject = null;
    }
    if (remoteVideoRef.current) {
      remoteVideoRef.current.srcObject = null;
    }
    // 关闭 PeerConnection
    if (pcRef.current) {
      pcRef.current.close();
      pcRef.current = null;
    }
    // 重置加入状态
    setJoined(false);
  };

  return (
    <div style={{ padding: "20px" }}>
      <h1>简易 WebRTC 房间</h1>
      <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap" }}>
        <div>
          <video
            ref={localVideoRef}
            autoPlay
            muted
            style={{ width: "300px", border: "1px solid black" }}
          />
          <video
            ref={remoteVideoRef}
            autoPlay
            style={{ width: "300px", border: "1px solid black", marginTop: "20px" }}
          />
        </div>
        <div style={{ marginLeft: "20px" }}>
          <button onClick={joinCall} disabled={!wsConnected || joined}>
            加入通话
          </button>
          <button
            onClick={disconnectCall}
            disabled={!wsConnected || !joined}
            style={{ marginLeft: "10px" }}
          >
            断开通话
          </button>
          <div style={{ marginTop: "10px", fontSize: "14px" }}>
            {localDelay !== null ? `我与 WS 延迟: ${localDelay}ms` : "我与 WS 延迟: 计算中..."}
          </div>
          <div style={{ marginTop: "10px", fontSize: "14px" }}>
            {remoteDelay !== null ? `对方与 WS 延迟: ${remoteDelay}ms` : "对方与 WS 延迟: 计算中..."}
          </div>
          <div style={{ marginTop: "10px", fontSize: "14px" }}>
            {localDelay !== null && remoteDelay !== null
              ? `我与对方延迟: ${localDelay + remoteDelay}ms`
              : "我与对方延迟: 计算中..."}
          </div>
          <div style={{ marginTop: "10px", fontSize: "14px" }}>
            {averageDelay !== null
              ? `最近10次平均延迟: ${averageDelay.toFixed(1)}ms`
              : "平均延迟: 计算中..."}
          </div>
        </div>
      </div>
    </div>
  );
};

export default App;
