package com.qaautomation.recorder

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log

/**
 * ADB 브로드캐스트 명령 수신기
 *
 * 사용 예시:
 * adb shell am broadcast -a com.qaautomation.recorder.START_RECORDING \
 *   --es filename "test.mp4" \
 *   --ei bitrate 2000000 \
 *   --es resolution "720x1280"
 *
 * adb shell am broadcast -a com.qaautomation.recorder.STOP_RECORDING
 *
 * adb shell am broadcast -a com.qaautomation.recorder.TAKE_SCREENSHOT \
 *   --es filename "screen.jpg"
 *
 * adb shell am broadcast -a com.qaautomation.recorder.MATCH_TEMPLATE \
 *   --es template "button.png" \
 *   --ef threshold 0.8 \
 *   --ei roi_x 0 --ei roi_y 0 --ei roi_width 500 --ei roi_height 500
 *
 * OpenCV 상태 확인:
 * adb shell am broadcast -a com.qaautomation.recorder.GET_STATUS
 */
class CommandReceiver : BroadcastReceiver() {

    companion object {
        private const val TAG = "CommandReceiver"

        // 액션 정의
        const val ACTION_START_RECORDING = "com.qaautomation.recorder.START_RECORDING"
        const val ACTION_STOP_RECORDING = "com.qaautomation.recorder.STOP_RECORDING"
        const val ACTION_GET_STATUS = "com.qaautomation.recorder.GET_STATUS"
        const val ACTION_TAKE_SCREENSHOT = "com.qaautomation.recorder.TAKE_SCREENSHOT"
        const val ACTION_MATCH_TEMPLATE = "com.qaautomation.recorder.MATCH_TEMPLATE"
        const val ACTION_INIT_SERVICE = "com.qaautomation.recorder.INIT_SERVICE"
        const val ACTION_STOP_SERVICE = "com.qaautomation.recorder.STOP_SERVICE"
    }

    override fun onReceive(context: Context, intent: Intent) {
        val action = intent.action ?: return
        Log.d(TAG, "Received action: $action")

        when (action) {
            ACTION_START_RECORDING -> handleStartRecording(context, intent)
            ACTION_STOP_RECORDING -> handleStopRecording(context)
            ACTION_GET_STATUS -> handleGetStatus(context)
            ACTION_TAKE_SCREENSHOT -> handleTakeScreenshot(context, intent)
            ACTION_MATCH_TEMPLATE -> handleMatchTemplate(context, intent)
            ACTION_INIT_SERVICE -> handleInitService(context)
            ACTION_STOP_SERVICE -> handleStopService(context)
            else -> Log.w(TAG, "Unknown action: $action")
        }
    }

    private fun handleStartRecording(context: Context, intent: Intent) {
        val service = RecorderService.instance

        if (service == null) {
            Log.e(TAG, "RecorderService is not running")
            writeError(context, "recording", "서비스가 실행되지 않았습니다. 앱에서 서비스를 먼저 시작하세요.")
            return
        }

        val filename = intent.getStringExtra("filename") ?: "recording_${System.currentTimeMillis()}.mp4"
        val bitrate = intent.getIntExtra("bitrate", 2_000_000)
        val resolution = intent.getStringExtra("resolution") ?: "720x1280"

        Log.d(TAG, "Start recording: $filename, ${bitrate}bps, $resolution")
        service.startRecording(filename, bitrate, resolution)
    }

    private fun handleStopRecording(context: Context) {
        val service = RecorderService.instance

        if (service == null) {
            Log.e(TAG, "RecorderService is not running")
            writeError(context, "recording_stop", "서비스가 실행되지 않았습니다")
            return
        }

        Log.d(TAG, "Stop recording")
        service.stopRecording()
    }

    private fun handleGetStatus(context: Context) {
        val service = RecorderService.instance

        val status = if (service == null) {
            StatusInfo(false, false, false, "서비스 미실행")
        } else {
            StatusInfo(
                serviceRunning = true,
                isRecording = service.isRecording(),
                isOpenCVReady = service.isOpenCVInitialized(),
                message = if (service.isRecording()) "녹화 중" else "대기 중"
            )
        }

        writeStatus(context, status)
    }

    private fun handleTakeScreenshot(context: Context, intent: Intent) {
        val service = RecorderService.instance

        if (service == null) {
            Log.e(TAG, "RecorderService is not running")
            writeError(context, "screenshot", "서비스가 실행되지 않았습니다")
            return
        }

        val filename = intent.getStringExtra("filename") ?: "screenshot_${System.currentTimeMillis()}.jpg"
        Log.d(TAG, "Take screenshot: $filename")
        service.takeScreenshot(filename)
    }

    private fun handleMatchTemplate(context: Context, intent: Intent) {
        val service = RecorderService.instance

        if (service == null) {
            Log.e(TAG, "RecorderService is not running")
            writeError(context, "match", "서비스가 실행되지 않았습니다")
            return
        }

        val template = intent.getStringExtra("template")
        if (template.isNullOrEmpty()) {
            writeError(context, "match", "템플릿 이름이 필요합니다")
            return
        }

        val threshold = intent.getFloatExtra("threshold", 0.8f)

        // ROI 영역 (옵션)
        val roiX = intent.getIntExtra("roi_x", -1)
        val roiY = intent.getIntExtra("roi_y", -1)
        val roiWidth = intent.getIntExtra("roi_width", -1)
        val roiHeight = intent.getIntExtra("roi_height", -1)

        val region = if (roiX >= 0 && roiY >= 0 && roiWidth > 0 && roiHeight > 0) {
            OpenCVTemplateManager.MatchRegion(roiX, roiY, roiWidth, roiHeight)
        } else null

        Log.d(TAG, "Match template (OpenCV): $template, threshold=$threshold, region=$region, opencv=${service.isOpenCVInitialized()}")
        service.matchTemplate(template, threshold, region)
    }

    private fun handleInitService(context: Context) {
        // 앱의 MainActivity를 시작하여 서비스 초기화 유도
        val intent = Intent(context, MainActivity::class.java).apply {
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }
        context.startActivity(intent)
        Log.d(TAG, "Launching MainActivity to initialize service")
    }

    private fun handleStopService(context: Context) {
        val serviceIntent = Intent(context, RecorderService::class.java).apply {
            action = RecorderService.ACTION_STOP
        }
        context.startService(serviceIntent)
        Log.d(TAG, "Stopping RecorderService")
    }

    // ========================================
    // 결과 파일 작성 (백엔드에서 읽기 위함)
    // ========================================

    private fun writeError(context: Context, type: String, message: String) {
        try {
            val resultDir = context.getExternalFilesDir("results")
            if (resultDir != null && !resultDir.exists()) {
                resultDir.mkdirs()
            }

            val resultFile = java.io.File(resultDir, "result.json")
            val json = """
                {
                    "type": "$type",
                    "success": false,
                    "message": "${message.replace("\"", "\\\"").replace("\n", "\\n")}",
                    "timestamp": ${System.currentTimeMillis()}
                }
            """.trimIndent()

            resultFile.writeText(json)
            Log.d(TAG, "Error result written: $json")
        } catch (e: Exception) {
            Log.e(TAG, "Error writing result", e)
        }
    }

    private fun writeStatus(context: Context, status: StatusInfo) {
        try {
            val resultDir = context.getExternalFilesDir("results")
            if (resultDir != null && !resultDir.exists()) {
                resultDir.mkdirs()
            }

            val resultFile = java.io.File(resultDir, "result.json")
            val json = """
                {
                    "type": "status",
                    "success": true,
                    "serviceRunning": ${status.serviceRunning},
                    "isRecording": ${status.isRecording},
                    "isOpenCVReady": ${status.isOpenCVReady},
                    "message": "${status.message}",
                    "timestamp": ${System.currentTimeMillis()}
                }
            """.trimIndent()

            resultFile.writeText(json)
            Log.d(TAG, "Status result written: $json")
        } catch (e: Exception) {
            Log.e(TAG, "Error writing status", e)
        }
    }

    data class StatusInfo(
        val serviceRunning: Boolean,
        val isRecording: Boolean,
        val isOpenCVReady: Boolean,
        val message: String
    )
}
