package com.qaautomation.recorder

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.media.projection.MediaProjection
import android.media.projection.MediaProjectionManager
import android.os.Build
import android.os.IBinder
import android.util.Log
import androidx.core.app.NotificationCompat
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch

class RecorderService : Service() {

    companion object {
        private const val TAG = "RecorderService"

        const val ACTION_START = "com.qaautomation.recorder.service.START"
        const val ACTION_STOP = "com.qaautomation.recorder.service.STOP"
        const val ACTION_GET_STATUS = "com.qaautomation.recorder.service.GET_STATUS"

        // 녹화 명령
        const val ACTION_START_RECORDING = "com.qaautomation.recorder.START_RECORDING"
        const val ACTION_STOP_RECORDING = "com.qaautomation.recorder.STOP_RECORDING"

        // 스크린샷 명령
        const val ACTION_TAKE_SCREENSHOT = "com.qaautomation.recorder.TAKE_SCREENSHOT"

        // 템플릿 매칭 명령 (OpenCV)
        const val ACTION_MATCH_TEMPLATE = "com.qaautomation.recorder.MATCH_TEMPLATE"

        const val EXTRA_RESULT_CODE = "result_code"
        const val EXTRA_DATA = "data"
        const val EXTRA_FILENAME = "filename"
        const val EXTRA_BITRATE = "bitrate"
        const val EXTRA_RESOLUTION = "resolution"
        const val EXTRA_TEMPLATE = "template"
        const val EXTRA_THRESHOLD = "threshold"
        // ROI 영역 (옵션)
        const val EXTRA_ROI_X = "roi_x"
        const val EXTRA_ROI_Y = "roi_y"
        const val EXTRA_ROI_WIDTH = "roi_width"
        const val EXTRA_ROI_HEIGHT = "roi_height"

        private const val NOTIFICATION_ID = 1001
        private const val CHANNEL_ID = "qa_recorder_channel"

        // 싱글톤 인스턴스 (CommandReceiver에서 접근용)
        @Volatile
        var instance: RecorderService? = null
            private set
    }

    private val serviceScope = CoroutineScope(SupervisorJob() + Dispatchers.Main)

    private var mediaProjectionManager: MediaProjectionManager? = null
    private var mediaProjection: MediaProjection? = null

    private var recordingManager: RecordingManager? = null
    private var screenshotManager: ScreenshotManager? = null
    private var openCVTemplateManager: OpenCVTemplateManager? = null

    private var isServiceRunning = false
    private var isOpenCVReady = false

    override fun onCreate() {
        super.onCreate()
        Log.d(TAG, "Service created")
        instance = this
        mediaProjectionManager = getSystemService(Context.MEDIA_PROJECTION_SERVICE) as MediaProjectionManager
        createNotificationChannel()

        // OpenCV 초기화
        isOpenCVReady = OpenCVTemplateManager.initialize()
        if (isOpenCVReady) {
            openCVTemplateManager = OpenCVTemplateManager(this)
            Log.d(TAG, "OpenCV initialized successfully")
        } else {
            Log.w(TAG, "OpenCV initialization failed - falling back to pixel matching")
        }
    }

    override fun onDestroy() {
        super.onDestroy()
        Log.d(TAG, "Service destroyed")
        instance = null
        cleanup()
        serviceScope.cancel()
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        Log.d(TAG, "onStartCommand: action=${intent?.action}")

        // Foreground Service는 반드시 startForeground()를 호출해야 함
        if (!isServiceRunning) {
            startForegroundWithNotification()
        }

        when (intent?.action) {
            ACTION_START -> {
                // Activity.RESULT_OK = -1, RESULT_CANCELED = 0
                // 기본값을 0(CANCELED)으로 설정해야 누락 시 감지 가능
                val resultCode = intent.getIntExtra(EXTRA_RESULT_CODE, 0)
                val data = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                    intent.getParcelableExtra(EXTRA_DATA, Intent::class.java)
                } else {
                    @Suppress("DEPRECATION")
                    intent.getParcelableExtra(EXTRA_DATA)
                }

                Log.d(TAG, "ACTION_START: resultCode=$resultCode (RESULT_OK=${android.app.Activity.RESULT_OK}), data=$data")

                if (resultCode == android.app.Activity.RESULT_OK && data != null) {
                    initializeMediaProjection(resultCode, data)
                } else {
                    Log.e(TAG, "Invalid MediaProjection data: resultCode=$resultCode, data=$data")
                    broadcastStatus("오류", "화면 녹화 권한이 필요합니다")
                }
            }

            ACTION_STOP -> {
                stopSelf()
            }

            ACTION_GET_STATUS -> {
                sendStatus()
            }

            // 녹화 명령은 CommandReceiver에서 브로드캐스트로 수신
            ACTION_START_RECORDING -> {
                val filename = intent.getStringExtra(EXTRA_FILENAME) ?: "recording_${System.currentTimeMillis()}.mp4"
                val bitrate = intent.getIntExtra(EXTRA_BITRATE, 2_000_000)
                val resolution = intent.getStringExtra(EXTRA_RESOLUTION) ?: "720x1280"
                startRecording(filename, bitrate, resolution)
            }

            ACTION_STOP_RECORDING -> {
                stopRecording()
            }

            ACTION_TAKE_SCREENSHOT -> {
                val filename = intent.getStringExtra(EXTRA_FILENAME) ?: "screenshot_${System.currentTimeMillis()}.jpg"
                takeScreenshot(filename)
            }

            ACTION_MATCH_TEMPLATE -> {
                val template = intent.getStringExtra(EXTRA_TEMPLATE) ?: return START_NOT_STICKY
                val threshold = intent.getFloatExtra(EXTRA_THRESHOLD, 0.8f)

                // ROI 영역 (옵션)
                val roiX = intent.getIntExtra(EXTRA_ROI_X, -1)
                val roiY = intent.getIntExtra(EXTRA_ROI_Y, -1)
                val roiWidth = intent.getIntExtra(EXTRA_ROI_WIDTH, -1)
                val roiHeight = intent.getIntExtra(EXTRA_ROI_HEIGHT, -1)

                val region = if (roiX >= 0 && roiY >= 0 && roiWidth > 0 && roiHeight > 0) {
                    OpenCVTemplateManager.MatchRegion(roiX, roiY, roiWidth, roiHeight)
                } else null

                matchTemplate(template, threshold, region)
            }
        }

        return START_STICKY
    }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID,
                getString(R.string.notification_channel_name),
                NotificationManager.IMPORTANCE_LOW
            ).apply {
                description = "QA Recorder 서비스 알림"
                setShowBadge(false)
            }

            val notificationManager = getSystemService(NotificationManager::class.java)
            notificationManager.createNotificationChannel(channel)
        }
    }

    private fun startForegroundWithNotification() {
        val notification = createNotification(getString(R.string.notification_ready))
        startForeground(NOTIFICATION_ID, notification)
        isServiceRunning = true
        Log.d(TAG, "Foreground service started")
    }

    private fun createNotification(contentText: String): Notification {
        val pendingIntent = PendingIntent.getActivity(
            this,
            0,
            Intent(this, MainActivity::class.java),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle(getString(R.string.notification_title))
            .setContentText(contentText)
            .setSmallIcon(android.R.drawable.ic_menu_camera)
            .setContentIntent(pendingIntent)
            .setOngoing(true)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setCategory(NotificationCompat.CATEGORY_SERVICE)
            .build()
    }

    private fun updateNotification(contentText: String) {
        val notification = createNotification(contentText)
        val notificationManager = getSystemService(NotificationManager::class.java)
        notificationManager.notify(NOTIFICATION_ID, notification)
    }

    private fun initializeMediaProjection(resultCode: Int, data: Intent) {
        try {
            mediaProjection = mediaProjectionManager?.getMediaProjection(resultCode, data)

            if (mediaProjection != null) {
                Log.d(TAG, "MediaProjection initialized")

                // RecordingManager 초기화
                recordingManager = RecordingManager(this, mediaProjection!!)

                // ScreenshotManager 초기화
                screenshotManager = ScreenshotManager(this, mediaProjection!!)

                broadcastStatus("준비 완료", "명령 대기 중")
            } else {
                Log.e(TAG, "Failed to get MediaProjection")
                broadcastStatus("오류", "MediaProjection 획득 실패")
            }
        } catch (e: Exception) {
            Log.e(TAG, "Error initializing MediaProjection", e)
            broadcastStatus("오류", e.message ?: "알 수 없는 오류")
        }
    }

    private fun cleanup() {
        recordingManager?.release()
        recordingManager = null

        screenshotManager?.release()
        screenshotManager = null

        mediaProjection?.stop()
        mediaProjection = null

        isServiceRunning = false
    }

    // ========================================
    // 녹화 기능
    // ========================================

    fun startRecording(filename: String, bitrate: Int, resolution: String) {
        serviceScope.launch {
            Log.d(TAG, "Starting recording: $filename, ${bitrate}bps, $resolution")

            if (recordingManager == null) {
                writeResult("recording", false, "서비스가 초기화되지 않았습니다")
                return@launch
            }

            try {
                val (width, height) = parseResolution(resolution)
                val outputPath = recordingManager!!.startRecording(filename, width, height, bitrate)

                updateNotification(getString(R.string.notification_recording))
                broadcastStatus("녹화 중", filename)
                writeResult("recording", true, outputPath)
            } catch (e: Exception) {
                Log.e(TAG, "Error starting recording", e)
                writeResult("recording", false, e.message ?: "녹화 시작 실패")
            }
        }
    }

    fun stopRecording() {
        serviceScope.launch {
            Log.d(TAG, "Stopping recording")

            if (recordingManager == null) {
                writeResult("recording_stop", false, "서비스가 초기화되지 않았습니다")
                return@launch
            }

            try {
                val outputPath = recordingManager!!.stopRecording()
                updateNotification(getString(R.string.notification_ready))
                broadcastStatus("준비 완료", "녹화 완료")
                writeResult("recording_stop", true, outputPath)
            } catch (e: Exception) {
                Log.e(TAG, "Error stopping recording", e)
                writeResult("recording_stop", false, e.message ?: "녹화 중지 실패")
            }
        }
    }

    fun isRecording(): Boolean {
        return recordingManager?.isRecording() == true
    }

    // ========================================
    // 스크린샷 기능
    // ========================================

    fun takeScreenshot(filename: String) {
        serviceScope.launch {
            Log.d(TAG, "Taking screenshot: $filename")

            if (screenshotManager == null) {
                writeResult("screenshot", false, "서비스가 초기화되지 않았습니다")
                return@launch
            }

            try {
                val outputPath = screenshotManager!!.capture(filename)
                writeResult("screenshot", true, outputPath)
            } catch (e: Exception) {
                Log.e(TAG, "Error taking screenshot", e)
                writeResult("screenshot", false, e.message ?: "스크린샷 실패")
            }
        }
    }

    // ========================================
    // 템플릿 매칭 기능 (OpenCV)
    // ========================================

    fun matchTemplate(
        templateName: String,
        threshold: Float,
        region: OpenCVTemplateManager.MatchRegion? = null
    ) {
        serviceScope.launch(Dispatchers.IO) {
            Log.d(TAG, "Matching template (OpenCV): $templateName, threshold=$threshold, region=$region")

            if (screenshotManager == null) {
                writeResult("match", false, """{"found":false,"error":"서비스가 초기화되지 않았습니다"}""")
                return@launch
            }

            try {
                // 스크린샷 캡처
                val screenshot = screenshotManager!!.captureBitmap()

                // OpenCV 사용 가능하면 OpenCV로 매칭
                val result = if (isOpenCVReady && openCVTemplateManager != null) {
                    Log.d(TAG, "Using OpenCV for template matching")
                    openCVTemplateManager!!.matchTemplate(screenshot, templateName, threshold, region)
                } else {
                    // Fallback: 기존 픽셀 비교 방식
                    Log.d(TAG, "Falling back to pixel matching")
                    val legacyResult = screenshotManager!!.matchTemplate(templateName, threshold)
                    // 레거시 결과를 OpenCV 결과 형식으로 변환
                    OpenCVTemplateManager.MatchResult(
                        found = legacyResult.found,
                        x = legacyResult.x,
                        y = legacyResult.y,
                        confidence = legacyResult.confidence,
                        error = legacyResult.error
                    )
                }

                screenshot.recycle()

                writeResult("match", result.found, result.toJson())
            } catch (e: Exception) {
                Log.e(TAG, "Error matching template", e)
                writeResult("match", false, """{"found":false,"error":"${e.message?.replace("\"", "\\\"")}"}""")
            }
        }
    }

    /**
     * OpenCV 초기화 상태 확인
     */
    fun isOpenCVInitialized(): Boolean = isOpenCVReady

    // ========================================
    // 유틸리티
    // ========================================

    private fun parseResolution(resolution: String): Pair<Int, Int> {
        val parts = resolution.split("x")
        return if (parts.size == 2) {
            Pair(parts[0].toIntOrNull() ?: 720, parts[1].toIntOrNull() ?: 1280)
        } else {
            Pair(720, 1280)
        }
    }

    private fun sendStatus() {
        val status = when {
            !isServiceRunning -> "대기 중"
            recordingManager?.isRecording() == true -> "녹화 중"
            mediaProjection != null -> "준비 완료"
            else -> "초기화 중"
        }
        broadcastStatus(status, "")
    }

    private fun broadcastStatus(status: String, detail: String) {
        val intent = Intent(MainActivity.ACTION_STATUS_UPDATE).apply {
            putExtra(MainActivity.EXTRA_STATUS, status)
            putExtra(MainActivity.EXTRA_DETAIL, detail)
            setPackage(packageName)
        }
        sendBroadcast(intent)
    }

    /**
     * 결과를 파일에 기록 (백엔드에서 읽기 위함)
     */
    private fun writeResult(type: String, success: Boolean, message: String) {
        try {
            val resultDir = getExternalFilesDir("results")
            if (resultDir != null && !resultDir.exists()) {
                resultDir.mkdirs()
            }

            val resultFile = java.io.File(resultDir, "result.json")
            val json = """
                {
                    "type": "$type",
                    "success": $success,
                    "message": "${message.replace("\"", "\\\"").replace("\n", "\\n")}",
                    "timestamp": ${System.currentTimeMillis()}
                }
            """.trimIndent()

            resultFile.writeText(json)
            Log.d(TAG, "Result written: $json")
        } catch (e: Exception) {
            Log.e(TAG, "Error writing result", e)
        }
    }
}
