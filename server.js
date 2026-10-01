const express = require("express");
const http = require("http");
const WebSocket = require("ws");

const app = express();

const PORT = process.env.PORT || 10000;

const server = http.createServer(app);

const wss = new WebSocket.Server({
    server,
    path: "/ws"
});

// ============================================================
// 手机连接
// ============================================================

let phoneA = null;
let phoneB = null;

// ============================================================
// 配对信息
// ============================================================

let pairCode = null;

// ============================================================
// 生成 6 位验证码
// ============================================================

function generatePairCode() {

    return Math.floor(
        100000 + Math.random() * 900000
    ).toString();
}

// ============================================================
// 发送消息
// ============================================================

function send(ws, message) {

    if (
        ws &&
        ws.readyState === WebSocket.OPEN
    ) {

        ws.send(message);

        return true;
    }

    return false;
}

// ============================================================
// 发送 JSON
// ============================================================

function sendJson(ws, data) {

    send(
        ws,
        JSON.stringify(data)
    );
}

// ============================================================
// 发送状态
// ============================================================

function sendStatus() {

    const message = {
        type: "STATUS",

        phoneA:
            phoneA !== null,

        phoneB:
            phoneB !== null,

        paired:
            phoneA !== null &&
            phoneB !== null &&
            pairCode !== null
    };

    sendJson(phoneA, message);
    sendJson(phoneB, message);
}

// ============================================================
// 首页
// ============================================================

app.get("/", (req, res) => {

    res.send(
        "RemoteControl WebSocket Server OK"
    );
});

// ============================================================
// 状态
// ============================================================

app.get("/status", (req, res) => {

    res.json({

        phoneA:
            phoneA !== null,

        phoneB:
            phoneB !== null,

        paired:
            phoneA !== null &&
            phoneB !== null &&
            pairCode !== null
    });
});

// ============================================================
// WebSocket 连接
// ============================================================

wss.on(
    "connection",
    (ws, request) => {

        const url =
            new URL(
                request.url,
                `http://${request.headers.host}`
            );

        const role =
            url.searchParams.get("role");

        console.log(
            "WebSocket connected:",
            role
        );

        // ====================================================
        // 检查角色
        // ====================================================

        if (
            role !== "A" &&
            role !== "B"
        ) {

            console.log(
                "Invalid role"
            );

            ws.close(
                1008,
                "Invalid role"
            );

            return;
        }

        // ====================================================
        // A 连接
        // ====================================================
if (role === "A") {

    if (phoneA) {
        console.log("Closing old Phone A");
        phoneA.close();
    }

    phoneA = ws;

    ws.role = "A";
    ws.paired = false;

    pairCode = generatePairCode();

    console.log("Phone A connected");
    console.log("New pair code:", pairCode);

    send(
        ws,
        `PAIR_CODE:${pairCode}`
    );

    sendStatus();

    // =================================================
    // A 消息
    // =================================================

    ws.on("message", (data) => {

        handleMessage(
            ws,
            data.toString()
        );

    });

    // =================================================
    // A 断开
    // =================================================

    ws.on("close", () => {

        handleDisconnect(ws);

    });

    // =================================================
    // A 错误
    // =================================================

    ws.on("error", (error) => {

        console.error(
            "Phone A WebSocket error:",
            error.message
        );

    });

    return;
}

        // ====================================================
        // B 连接
        // ====================================================

        if (role === "B") {

            // 如果已经有 B
            if (phoneB) {

                console.log(
                    "Closing old Phone B"
                );

                phoneB.close();
            }

            phoneB = ws;

            ws.role = "B";

            ws.paired = false;

            console.log(
                "Phone B connected"
            );

            // B 此时还没有配对
            send(
                ws,
                "WAITING_FOR_PAIR"
            );

            sendStatus();

            // =================================================
            // B 消息
            // =================================================

            ws.on(
                "message",
                (data) => {

                    handleMessage(
                        ws,
                        data.toString()
                    );
                }
            );

            ws.on(
                "close",
                () => {

                    handleDisconnect(
                        ws
                    );
                }
            );

            ws.on(
                "error",
                (error) => {

                    console.error(
                        "WebSocket error:",
                        error.message
                    );
                }
            );

            return;
        }

        // 理论上不会到这里
    }
);

// ============================================================
// 处理消息
// ============================================================

function handleMessage(
    ws,
    message
) {

    console.log(
        `[${ws.role}] ${message.substring(0, 100)}`
    );

    // ========================================================
    // A 消息
    // ========================================================

    if (ws.role === "A") {

        // ----------------------------------------------------
        // A 请求新的验证码
        // ----------------------------------------------------

        if (
            message === "REQUEST_PAIR_CODE"
        ) {

            // 必须是当前 A
            if (phoneA !== ws) {
                return;
            }

            pairCode =
                generatePairCode();

            ws.paired = false;

            send(
                ws,
                `PAIR_CODE:${pairCode}`
            );

            // 如果已有 B，解除配对
            if (phoneB) {

                phoneB.paired = false;

                send(
                    phoneB,
                    "PAIR_RESET"
                );
            }

            console.log(
                "New pair code:",
                pairCode
            );

            sendStatus();

            return;
        }

        // ----------------------------------------------------
        // A 的普通消息
        // ----------------------------------------------------

        if (
            !ws.paired ||
            !phoneB ||
            !phoneB.paired
        ) {

            console.log(
                "A not paired, message ignored"
            );

            return;
        }

        // A → B
        send(
            phoneB,
            message
        );

        return;
    }

    // ========================================================
    // B 消息
    // ========================================================

    if (ws.role === "B") {

// ----------------------------------------------------
// B 输入验证码
// ----------------------------------------------------

if (
    message.startsWith("PAIR:")
) {

    const code =
        message
            .substring("PAIR:".length)
            .trim();

    console.log(
        "================================="
    );

    console.log(
        "B trying pair code:",
        code
    );

    console.log(
        "Current server pair code:",
        pairCode
    );

    console.log(
        "Phone A exists:",
        phoneA !== null
    );

    console.log(
        "Phone B exists:",
        phoneB !== null
    );

    console.log(
        "================================="
    );

    // 没有 A
    if (!phoneA) {

        console.log(
            "PAIR FAILED: A_NOT_CONNECTED"
        );

        send(
            ws,
            "PAIR_FAILED:A_NOT_CONNECTED"
        );

        return;
    }

    // 没有验证码
    if (!pairCode) {

        console.log(
            "PAIR FAILED: NO_PAIR_CODE"
        );

        send(
            ws,
            "PAIR_FAILED:NO_PAIR_CODE"
        );

        return;
    }

    // 验证码错误
    if (
        code !== pairCode
    ) {

        console.log(
            "PAIR FAILED: INVALID_CODE"
        );

        console.log(
            "B code:",
            code
        );

        console.log(
            "Server code:",
            pairCode
        );

        send(
            ws,
            "PAIR_FAILED:INVALID_CODE"
        );

        return;
    }

    // =================================================
    // 配对成功
    // =================================================

    phoneA.paired = true;
    phoneB.paired = true;
    ws.paired = true;

    console.log(
        "================================="
    );

    console.log(
        "PAIR SUCCESS"
    );

    console.log(
        "Phone A and Phone B paired successfully"
    );

    console.log(
        "================================="
    );

    // 告诉 A
    send(
        phoneA,
        "PAIR_SUCCESS"
    );

    // 告诉 B
    send(
        phoneB,
        "PAIR_SUCCESS"
    );

    // 状态
    sendStatus();

    return;
}

        // ----------------------------------------------------
        // B 尚未配对
        // ----------------------------------------------------

        if (
            !ws.paired ||
            !phoneA ||
            !phoneA.paired
        ) {

            console.log(
                "B not paired, message ignored"
            );

            return;
        }

        // ----------------------------------------------------
        // B → A
        // ----------------------------------------------------

        send(
            phoneA,
            message
        );

        return;
    }
}

// ============================================================
// 断开连接
// ============================================================

function handleDisconnect(ws) {

    console.log(
        "WebSocket closed:",
        ws.role
    );

    // ========================================================
    // A 断开
    // ========================================================

    if (
        ws.role === "A" &&
        phoneA === ws
    ) {

        phoneA = null;

        pairCode = null;

        // B 解除配对
        if (phoneB) {

            phoneB.paired = false;

            send(
                phoneB,
                "PAIR_RESET"
            );
        }
    }
    // ========================================================
    // B 断开
    // ========================================================
    if (
        ws.role === "B" &&
        phoneB === ws
    ) {
        phoneB = null;
        // A 解除配对
        if (phoneA) {

            phoneA.paired = false;
        }
    }
    sendStatus();
}
// ============================================================
// 服务器启动
// ============================================================
server.listen(
    PORT,
    "0.0.0.0",
    () => {

        console.log(
            `Server running on port ${PORT}`
        );
    }
);
