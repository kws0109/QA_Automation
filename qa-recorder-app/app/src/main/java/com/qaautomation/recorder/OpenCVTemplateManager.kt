package com.qaautomation.recorder

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.util.Log
import org.opencv.android.OpenCVLoader
import org.opencv.android.Utils
import org.opencv.core.Core
import org.opencv.core.CvType
import org.opencv.core.Mat
import org.opencv.core.Point
import org.opencv.core.Scalar
import org.opencv.core.Size
import org.opencv.imgproc.CLAHE
import org.opencv.imgproc.Imgproc
import java.io.File

/**
 * OpenCV 기반 템플릿 매칭 매니저
 *
 * 디바이스에서 직접 템플릿 매칭을 수행하여 네트워크 트래픽을 최소화합니다.
 * - TM_CCOEFF_NORMED 알고리즘 사용 (백엔드와 동일)
 * - 매칭 결과만 전송 (스크린샷 전송 불필요)
 */
class OpenCVTemplateManager(private val context: Context) {

    companion object {
        private const val TAG = "OpenCVTemplateManager"

        @Volatile
        private var isInitialized = false

        /**
         * OpenCV 초기화
         * 앱 시작 시 한 번만 호출
         */
        fun initialize(): Boolean {
            if (isInitialized) return true

            return try {
                if (OpenCVLoader.initLocal()) {
                    isInitialized = true
                    Log.d(TAG, "OpenCV initialized successfully: ${OpenCVLoader.OPENCV_VERSION}")
                    true
                } else {
                    Log.e(TAG, "OpenCV initialization failed")
                    false
                }
            } catch (e: Exception) {
                Log.e(TAG, "OpenCV initialization error", e)
                false
            }
        }

        fun isReady(): Boolean = isInitialized
    }

    /**
     * 템플릿 매칭 수행
     *
     * @param screenshot 스크린샷 Bitmap
     * @param templateName 템플릿 파일명 (templates/ 폴더 내)
     * @param threshold 매칭 임계값 (0.0 ~ 1.0)
     * @param region ROI 영역 (null이면 전체 화면)
     * @return 매칭 결과
     */
    fun matchTemplate(
        screenshot: Bitmap,
        templateName: String,
        threshold: Float = 0.8f,
        region: MatchRegion? = null
    ): MatchResult {
        if (!isInitialized) {
            return MatchResult(
                found = false,
                error = "OpenCV가 초기화되지 않았습니다"
            )
        }

        val startTime = System.currentTimeMillis()

        // 템플릿 이미지 로드
        val templateFile = File(getTemplatesDirectory(), templateName)
        if (!templateFile.exists()) {
            Log.e(TAG, "Template not found: ${templateFile.absolutePath}")
            return MatchResult(
                found = false,
                error = "템플릿 파일을 찾을 수 없습니다: $templateName"
            )
        }

        val templateBitmap = BitmapFactory.decodeFile(templateFile.absolutePath)
            ?: return MatchResult(
                found = false,
                error = "템플릿 이미지 로드 실패: $templateName"
            )

        try {
            // Bitmap → Mat 변환
            val srcMat = Mat()
            val tmplMat = Mat()

            Utils.bitmapToMat(screenshot, srcMat)
            Utils.bitmapToMat(templateBitmap, tmplMat)

            // ROI 적용
            val roiMat = if (region != null) {
                val roiRect = org.opencv.core.Rect(
                    region.x,
                    region.y,
                    minOf(region.width, srcMat.cols() - region.x),
                    minOf(region.height, srcMat.rows() - region.y)
                )
                Mat(srcMat, roiRect)
            } else {
                srcMat
            }

            // 그레이스케일 변환
            val srcGray = Mat()
            val tmplGray = Mat()
            Imgproc.cvtColor(roiMat, srcGray, Imgproc.COLOR_RGBA2GRAY)
            Imgproc.cvtColor(tmplMat, tmplGray, Imgproc.COLOR_RGBA2GRAY)

            // CLAHE 적용 (Contrast Limited Adaptive Histogram Equalization)
            // 지역적 대비 보정으로 더 정밀한 매칭
            val clahe = Imgproc.createCLAHE(2.0, Size(8.0, 8.0))
            val srcEqualized = Mat()
            val tmplEqualized = Mat()
            clahe.apply(srcGray, srcEqualized)
            clahe.apply(tmplGray, tmplEqualized)

            // 템플릿 매칭 (TM_CCOEFF_NORMED)
            val resultMat = Mat()
            Imgproc.matchTemplate(srcEqualized, tmplEqualized, resultMat, Imgproc.TM_CCOEFF_NORMED)

            // 최대값 위치 찾기
            val minMaxResult = Core.minMaxLoc(resultMat)
            val maxVal = minMaxResult.maxVal
            val maxLoc = minMaxResult.maxLoc

            // ROI 오프셋 적용
            val offsetX = region?.x ?: 0
            val offsetY = region?.y ?: 0

            // 중심 좌표 계산
            val centerX = (maxLoc.x + tmplMat.cols() / 2 + offsetX).toInt()
            val centerY = (maxLoc.y + tmplMat.rows() / 2 + offsetY).toInt()

            val matchTime = System.currentTimeMillis() - startTime

            // 리소스 해제
            srcMat.release()
            tmplMat.release()
            if (region != null) roiMat.release()
            srcGray.release()
            tmplGray.release()
            srcEqualized.release()
            tmplEqualized.release()
            resultMat.release()

            val found = maxVal >= threshold

            Log.d(TAG, "Template match: $templateName, confidence=${(maxVal * 100).toInt()}%, " +
                    "threshold=${(threshold * 100).toInt()}%, found=$found, time=${matchTime}ms")

            return MatchResult(
                found = found,
                x = centerX,
                y = centerY,
                confidence = maxVal.toFloat(),
                matchTime = matchTime,
                templateWidth = templateBitmap.width,
                templateHeight = templateBitmap.height
            )

        } catch (e: Exception) {
            Log.e(TAG, "Template matching error", e)
            return MatchResult(
                found = false,
                error = "매칭 오류: ${e.message}"
            )
        } finally {
            templateBitmap.recycle()
        }
    }

    /**
     * 하이라이트 이미지 생성 (디버깅용)
     */
    fun createHighlightedImage(
        screenshot: Bitmap,
        matchResult: MatchResult,
        color: Scalar = Scalar(0.0, 255.0, 0.0, 255.0), // Green
        thickness: Int = 4
    ): Bitmap? {
        if (!matchResult.found) return null

        try {
            val mat = Mat()
            Utils.bitmapToMat(screenshot, mat)

            // 매칭 영역 사각형 그리기
            val topLeft = Point(
                (matchResult.x - matchResult.templateWidth / 2).toDouble(),
                (matchResult.y - matchResult.templateHeight / 2).toDouble()
            )
            val bottomRight = Point(
                (matchResult.x + matchResult.templateWidth / 2).toDouble(),
                (matchResult.y + matchResult.templateHeight / 2).toDouble()
            )

            Imgproc.rectangle(mat, topLeft, bottomRight, color, thickness)

            // Mat → Bitmap 변환
            val resultBitmap = Bitmap.createBitmap(mat.cols(), mat.rows(), Bitmap.Config.ARGB_8888)
            Utils.matToBitmap(mat, resultBitmap)

            mat.release()
            return resultBitmap

        } catch (e: Exception) {
            Log.e(TAG, "Failed to create highlighted image", e)
            return null
        }
    }

    /**
     * 템플릿 디렉토리 경로
     */
    private fun getTemplatesDirectory(): File {
        val dir = context.getExternalFilesDir("templates")
            ?: File(context.filesDir, "templates")
        if (!dir.exists()) dir.mkdirs()
        return dir
    }

    /**
     * 템플릿 파일 존재 여부 확인
     */
    fun hasTemplate(templateName: String): Boolean {
        val templateFile = File(getTemplatesDirectory(), templateName)
        return templateFile.exists()
    }

    /**
     * 템플릿 목록 조회
     */
    fun listTemplates(): List<String> {
        val dir = getTemplatesDirectory()
        return dir.listFiles()
            ?.filter { it.isFile && (it.extension == "png" || it.extension == "jpg") }
            ?.map { it.name }
            ?: emptyList()
    }

    /**
     * 매칭 영역 (ROI)
     */
    data class MatchRegion(
        val x: Int,
        val y: Int,
        val width: Int,
        val height: Int
    )

    /**
     * 매칭 결과
     */
    data class MatchResult(
        val found: Boolean,
        val x: Int = 0,
        val y: Int = 0,
        val confidence: Float = 0f,
        val matchTime: Long = 0,
        val templateWidth: Int = 0,
        val templateHeight: Int = 0,
        val error: String? = null
    ) {
        fun toJson(): String {
            return if (error != null) {
                """{"found":false,"x":0,"y":0,"confidence":0,"error":"$error"}"""
            } else {
                """{"found":$found,"x":$x,"y":$y,"confidence":$confidence,"matchTime":$matchTime,"templateWidth":$templateWidth,"templateHeight":$templateHeight}"""
            }
        }
    }
}
