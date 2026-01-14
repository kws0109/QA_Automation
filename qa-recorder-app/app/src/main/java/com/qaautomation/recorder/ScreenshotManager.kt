package com.qaautomation.recorder

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.PixelFormat
import android.hardware.display.DisplayManager
import android.hardware.display.VirtualDisplay
import android.media.Image
import android.media.ImageReader
import android.media.projection.MediaProjection
import android.os.Handler
import android.os.HandlerThread
import android.util.DisplayMetrics
import android.util.Log
import android.view.WindowManager
import java.io.File
import java.io.FileOutputStream
import kotlin.math.abs
import kotlin.math.min

/**
 * 스크린샷 캡처 및 템플릿 매칭 관리자
 */
class ScreenshotManager(
    private val context: Context,
    private val mediaProjection: MediaProjection
) {
    companion object {
        private const val TAG = "ScreenshotManager"
        private const val VIRTUAL_DISPLAY_NAME = "QAScreenshotDisplay"
    }

    private val displayMetrics: DisplayMetrics by lazy {
        DisplayMetrics().also {
            val windowManager = context.getSystemService(Context.WINDOW_SERVICE) as WindowManager
            @Suppress("DEPRECATION")
            windowManager.defaultDisplay.getMetrics(it)
        }
    }

    private var imageReader: ImageReader? = null
    private var virtualDisplay: VirtualDisplay? = null
    private var handlerThread: HandlerThread? = null
    private var handler: Handler? = null

    init {
        setupImageReader()
    }

    private fun setupImageReader() {
        val width = displayMetrics.widthPixels
        val height = displayMetrics.heightPixels

        handlerThread = HandlerThread("ScreenshotThread").apply { start() }
        handler = Handler(handlerThread!!.looper)

        imageReader = ImageReader.newInstance(
            width, height,
            PixelFormat.RGBA_8888,
            2
        )

        virtualDisplay = mediaProjection.createVirtualDisplay(
            VIRTUAL_DISPLAY_NAME,
            width, height,
            displayMetrics.densityDpi,
            DisplayManager.VIRTUAL_DISPLAY_FLAG_AUTO_MIRROR,
            imageReader!!.surface,
            null,
            handler
        )

        Log.d(TAG, "ImageReader initialized: ${width}x${height}")
    }

    /**
     * 스크린샷 캡처
     *
     * @param filename 저장할 파일명
     * @return 저장된 파일 경로
     */
    fun capture(filename: String): String {
        Log.d(TAG, "Capturing screenshot: $filename")

        val image = acquireLatestImage()
            ?: throw IllegalStateException("스크린샷 캡처 실패")

        try {
            val bitmap = imageToBitmap(image)
            val outputPath = saveBitmap(bitmap, filename)
            bitmap.recycle()

            Log.d(TAG, "Screenshot saved: $outputPath")
            return outputPath
        } finally {
            image.close()
        }
    }

    /**
     * 현재 화면을 Bitmap으로 캡처
     */
    fun captureBitmap(): Bitmap {
        val image = acquireLatestImage()
            ?: throw IllegalStateException("스크린샷 캡처 실패")

        return try {
            imageToBitmap(image)
        } finally {
            image.close()
        }
    }

    /**
     * 템플릿 매칭 수행
     *
     * @param templateName 템플릿 파일명 (templates/ 폴더 내)
     * @param threshold 매칭 임계값 (0.0 ~ 1.0)
     * @return 매칭 결과
     */
    fun matchTemplate(templateName: String, threshold: Float): MatchResult {
        Log.d(TAG, "Matching template: $templateName, threshold=$threshold")

        // 템플릿 이미지 로드
        val templateFile = File(getTemplatesDirectory(), templateName)
        if (!templateFile.exists()) {
            Log.e(TAG, "Template not found: ${templateFile.absolutePath}")
            return MatchResult(false, 0, 0, 0f, "템플릿 파일을 찾을 수 없습니다")
        }

        val template = BitmapFactory.decodeFile(templateFile.absolutePath)
            ?: return MatchResult(false, 0, 0, 0f, "템플릿 이미지 로드 실패")

        // 현재 화면 캡처
        val screenshot = captureBitmap()

        try {
            // 템플릿 매칭 수행
            val result = findTemplate(screenshot, template, threshold)
            Log.d(TAG, "Match result: $result")
            return result
        } finally {
            template.recycle()
            screenshot.recycle()
        }
    }

    /**
     * 리소스 해제
     */
    fun release() {
        virtualDisplay?.release()
        virtualDisplay = null

        imageReader?.close()
        imageReader = null

        handlerThread?.quitSafely()
        handlerThread = null
        handler = null

        Log.d(TAG, "ScreenshotManager released")
    }

    // ========================================
    // 내부 메서드
    // ========================================

    private fun acquireLatestImage(): Image? {
        // ImageReader에서 최신 이미지 획득 (재시도 포함)
        var image: Image? = null
        var retries = 0
        val maxRetries = 10

        while (image == null && retries < maxRetries) {
            image = imageReader?.acquireLatestImage()
            if (image == null) {
                Thread.sleep(50)
                retries++
            }
        }

        if (image == null) {
            Log.w(TAG, "Failed to acquire image after $maxRetries retries")
        }

        return image
    }

    private fun imageToBitmap(image: Image): Bitmap {
        val planes = image.planes
        val buffer = planes[0].buffer
        val pixelStride = planes[0].pixelStride
        val rowStride = planes[0].rowStride
        val rowPadding = rowStride - pixelStride * image.width

        val bitmap = Bitmap.createBitmap(
            image.width + rowPadding / pixelStride,
            image.height,
            Bitmap.Config.ARGB_8888
        )
        bitmap.copyPixelsFromBuffer(buffer)

        // 패딩 제거된 비트맵 반환
        return if (rowPadding > 0) {
            val croppedBitmap = Bitmap.createBitmap(bitmap, 0, 0, image.width, image.height)
            bitmap.recycle()
            croppedBitmap
        } else {
            bitmap
        }
    }

    private fun saveBitmap(bitmap: Bitmap, filename: String): String {
        val outputDir = getScreenshotsDirectory()
        val outputFile = File(outputDir, filename)

        FileOutputStream(outputFile).use { out ->
            val format = if (filename.endsWith(".png")) {
                Bitmap.CompressFormat.PNG
            } else {
                Bitmap.CompressFormat.JPEG
            }
            bitmap.compress(format, 90, out)
        }

        return outputFile.absolutePath
    }

    private fun getScreenshotsDirectory(): File {
        val dir = context.getExternalFilesDir("screenshots")
            ?: File(context.filesDir, "screenshots")
        if (!dir.exists()) dir.mkdirs()
        return dir
    }

    private fun getTemplatesDirectory(): File {
        val dir = context.getExternalFilesDir("templates")
            ?: File(context.filesDir, "templates")
        if (!dir.exists()) dir.mkdirs()
        return dir
    }

    // ========================================
    // 템플릿 매칭 (간단한 픽셀 비교 방식)
    // OpenCV 통합 전 임시 구현
    // ========================================

    private fun findTemplate(screenshot: Bitmap, template: Bitmap, threshold: Float): MatchResult {
        if (template.width > screenshot.width || template.height > screenshot.height) {
            return MatchResult(false, 0, 0, 0f, "템플릿이 화면보다 큽니다")
        }

        var bestX = 0
        var bestY = 0
        var bestScore = 0f

        val step = 4 // 성능을 위해 4픽셀씩 건너뛰기

        val screenshotWidth = screenshot.width
        val screenshotHeight = screenshot.height
        val templateWidth = template.width
        val templateHeight = template.height

        // 스크린샷과 템플릿 픽셀 배열
        val screenshotPixels = IntArray(screenshotWidth * screenshotHeight)
        val templatePixels = IntArray(templateWidth * templateHeight)
        screenshot.getPixels(screenshotPixels, 0, screenshotWidth, 0, 0, screenshotWidth, screenshotHeight)
        template.getPixels(templatePixels, 0, templateWidth, 0, 0, templateWidth, templateHeight)

        // 슬라이딩 윈도우로 검색
        for (y in 0 until (screenshotHeight - templateHeight) step step) {
            for (x in 0 until (screenshotWidth - templateWidth) step step) {
                val score = calculateMatchScore(
                    screenshotPixels, screenshotWidth,
                    templatePixels, templateWidth, templateHeight,
                    x, y
                )

                if (score > bestScore) {
                    bestScore = score
                    bestX = x
                    bestY = y

                    // 높은 점수 발견 시 조기 종료
                    if (score > 0.95f) {
                        return MatchResult(true, bestX + templateWidth / 2, bestY + templateHeight / 2, bestScore)
                    }
                }
            }
        }

        // 정밀 검색 (최적 위치 주변)
        if (bestScore > threshold * 0.8f) {
            for (dy in -step until step) {
                for (dx in -step until step) {
                    val nx = bestX + dx
                    val ny = bestY + dy

                    if (nx < 0 || ny < 0 ||
                        nx + templateWidth > screenshotWidth ||
                        ny + templateHeight > screenshotHeight) {
                        continue
                    }

                    val score = calculateMatchScore(
                        screenshotPixels, screenshotWidth,
                        templatePixels, templateWidth, templateHeight,
                        nx, ny
                    )

                    if (score > bestScore) {
                        bestScore = score
                        bestX = nx
                        bestY = ny
                    }
                }
            }
        }

        val found = bestScore >= threshold
        val centerX = bestX + templateWidth / 2
        val centerY = bestY + templateHeight / 2

        return MatchResult(found, centerX, centerY, bestScore)
    }

    private fun calculateMatchScore(
        screenshotPixels: IntArray, screenshotWidth: Int,
        templatePixels: IntArray, templateWidth: Int, templateHeight: Int,
        offsetX: Int, offsetY: Int
    ): Float {
        var matchingPixels = 0
        var totalPixels = 0
        val sampleStep = 2 // 샘플링으로 성능 향상

        for (ty in 0 until templateHeight step sampleStep) {
            for (tx in 0 until templateWidth step sampleStep) {
                val templatePixel = templatePixels[ty * templateWidth + tx]
                val screenshotPixel = screenshotPixels[(offsetY + ty) * screenshotWidth + (offsetX + tx)]

                if (pixelsMatch(templatePixel, screenshotPixel)) {
                    matchingPixels++
                }
                totalPixels++
            }
        }

        return matchingPixels.toFloat() / totalPixels.toFloat()
    }

    private fun pixelsMatch(p1: Int, p2: Int, tolerance: Int = 30): Boolean {
        val r1 = (p1 shr 16) and 0xFF
        val g1 = (p1 shr 8) and 0xFF
        val b1 = p1 and 0xFF

        val r2 = (p2 shr 16) and 0xFF
        val g2 = (p2 shr 8) and 0xFF
        val b2 = p2 and 0xFF

        return abs(r1 - r2) <= tolerance &&
                abs(g1 - g2) <= tolerance &&
                abs(b1 - b2) <= tolerance
    }

    /**
     * 매칭 결과 데이터 클래스
     */
    data class MatchResult(
        val found: Boolean,
        val x: Int,
        val y: Int,
        val confidence: Float,
        val error: String? = null
    ) {
        fun toJson(): String {
            return if (error != null) {
                """{"found":false,"x":0,"y":0,"confidence":0,"error":"$error"}"""
            } else {
                """{"found":$found,"x":$x,"y":$y,"confidence":$confidence}"""
            }
        }
    }
}
