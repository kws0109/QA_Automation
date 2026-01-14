package com.qaautomation.recorder

import android.content.Context
import android.hardware.display.DisplayManager
import android.hardware.display.VirtualDisplay
import android.media.MediaRecorder
import android.media.projection.MediaProjection
import android.os.Build
import android.os.Environment
import android.util.DisplayMetrics
import android.util.Log
import android.view.WindowManager
import java.io.File

/**
 * MediaProjection을 사용한 화면 녹화 관리자
 */
class RecordingManager(
    private val context: Context,
    private val mediaProjection: MediaProjection
) {
    companion object {
        private const val TAG = "RecordingManager"
        private const val VIRTUAL_DISPLAY_NAME = "QARecorderDisplay"
    }

    private var mediaRecorder: MediaRecorder? = null
    private var virtualDisplay: VirtualDisplay? = null
    private var currentOutputPath: String? = null

    @Volatile
    private var recording = false

    private val displayMetrics: DisplayMetrics by lazy {
        DisplayMetrics().also {
            val windowManager = context.getSystemService(Context.WINDOW_SERVICE) as WindowManager
            @Suppress("DEPRECATION")
            windowManager.defaultDisplay.getMetrics(it)
        }
    }

    /**
     * 녹화 시작
     *
     * @param filename 출력 파일명 (확장자 포함)
     * @param width 녹화 해상도 너비
     * @param height 녹화 해상도 높이
     * @param bitrate 비트레이트 (bps)
     * @return 출력 파일 경로
     */
    fun startRecording(filename: String, width: Int, height: Int, bitrate: Int): String {
        if (recording) {
            throw IllegalStateException("이미 녹화 중입니다")
        }

        Log.d(TAG, "Starting recording: ${width}x${height}, ${bitrate}bps")

        // 출력 파일 경로 설정
        val outputDir = getOutputDirectory()
        val outputFile = File(outputDir, filename)
        currentOutputPath = outputFile.absolutePath

        try {
            // MediaRecorder 설정
            mediaRecorder = createMediaRecorder(outputFile.absolutePath, width, height, bitrate)
            mediaRecorder?.prepare()

            // VirtualDisplay 생성 및 녹화 시작
            virtualDisplay = createVirtualDisplay(width, height)
            mediaRecorder?.start()

            recording = true
            Log.d(TAG, "Recording started: $currentOutputPath")

            return currentOutputPath!!
        } catch (e: Exception) {
            Log.e(TAG, "Failed to start recording", e)
            cleanup()
            throw e
        }
    }

    /**
     * 녹화 중지
     *
     * @return 출력 파일 경로
     */
    fun stopRecording(): String {
        if (!recording) {
            throw IllegalStateException("녹화 중이 아닙니다")
        }

        Log.d(TAG, "Stopping recording")

        val outputPath = currentOutputPath ?: throw IllegalStateException("출력 파일 경로 없음")

        try {
            mediaRecorder?.stop()
        } catch (e: Exception) {
            Log.w(TAG, "Error stopping MediaRecorder", e)
        }

        cleanup()
        recording = false

        Log.d(TAG, "Recording stopped: $outputPath")
        return outputPath
    }

    /**
     * 현재 녹화 중인지 확인
     */
    fun isRecording(): Boolean = recording

    /**
     * 리소스 해제
     */
    fun release() {
        if (recording) {
            try {
                stopRecording()
            } catch (e: Exception) {
                Log.w(TAG, "Error stopping recording on release", e)
            }
        }
        cleanup()
    }

    private fun cleanup() {
        virtualDisplay?.release()
        virtualDisplay = null

        mediaRecorder?.release()
        mediaRecorder = null
    }

    private fun createMediaRecorder(outputPath: String, width: Int, height: Int, bitrate: Int): MediaRecorder {
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            MediaRecorder(context)
        } else {
            @Suppress("DEPRECATION")
            MediaRecorder()
        }.apply {
            setVideoSource(MediaRecorder.VideoSource.SURFACE)
            setOutputFormat(MediaRecorder.OutputFormat.MPEG_4)
            setOutputFile(outputPath)
            setVideoEncoder(MediaRecorder.VideoEncoder.H264)
            setVideoEncodingBitRate(bitrate)
            setVideoFrameRate(30)
            setVideoSize(width, height)

            // 오디오 설정 (옵션 - 현재는 비활성화)
            // setAudioSource(MediaRecorder.AudioSource.MIC)
            // setAudioEncoder(MediaRecorder.AudioEncoder.AAC)
        }
    }

    private fun createVirtualDisplay(width: Int, height: Int): VirtualDisplay {
        val surface = mediaRecorder?.surface
            ?: throw IllegalStateException("MediaRecorder surface is null")

        return mediaProjection.createVirtualDisplay(
            VIRTUAL_DISPLAY_NAME,
            width,
            height,
            displayMetrics.densityDpi,
            DisplayManager.VIRTUAL_DISPLAY_FLAG_AUTO_MIRROR,
            surface,
            null,
            null
        )
    }

    private fun getOutputDirectory(): File {
        // 외부 저장소의 앱 전용 디렉토리 사용
        val dir = context.getExternalFilesDir("recordings")
            ?: File(context.filesDir, "recordings")

        if (!dir.exists()) {
            dir.mkdirs()
        }

        return dir
    }
}
