package com.qaautomation.recorder

import android.Manifest
import android.app.Activity
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.PackageManager
import android.media.projection.MediaProjectionManager
import android.os.Build
import android.os.Bundle
import android.widget.Toast
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import com.qaautomation.recorder.databinding.ActivityMainBinding

class MainActivity : AppCompatActivity() {

    private lateinit var binding: ActivityMainBinding
    private lateinit var mediaProjectionManager: MediaProjectionManager

    // 권한 요청 결과 처리
    private val permissionLauncher = registerForActivityResult(
        ActivityResultContracts.RequestMultiplePermissions()
    ) { permissions ->
        updatePermissionStatus()
        if (permissions.all { it.value }) {
            Toast.makeText(this, "모든 권한이 허용되었습니다", Toast.LENGTH_SHORT).show()
        }
    }

    // MediaProjection 권한 요청 결과 처리
    private val mediaProjectionLauncher = registerForActivityResult(
        ActivityResultContracts.StartActivityForResult()
    ) { result ->
        if (result.resultCode == Activity.RESULT_OK && result.data != null) {
            // 권한 획득 성공 - 서비스 시작
            startRecorderService(result.resultCode, result.data!!)
        } else {
            Toast.makeText(this, "화면 녹화 권한이 필요합니다", Toast.LENGTH_SHORT).show()
            updateStatus("오류", "화면 녹화 권한 거부됨")
        }
    }

    // 서비스 상태 수신기
    private val statusReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context?, intent: Intent?) {
            when (intent?.action) {
                ACTION_STATUS_UPDATE -> {
                    val status = intent.getStringExtra(EXTRA_STATUS) ?: "알 수 없음"
                    val detail = intent.getStringExtra(EXTRA_DETAIL) ?: ""
                    updateStatus(status, detail)
                }
            }
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityMainBinding.inflate(layoutInflater)
        setContentView(binding.root)

        mediaProjectionManager = getSystemService(Context.MEDIA_PROJECTION_SERVICE) as MediaProjectionManager

        setupUI()
        updatePermissionStatus()

        // 서비스 상태 수신기 등록
        val filter = IntentFilter(ACTION_STATUS_UPDATE)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            registerReceiver(statusReceiver, filter, RECEIVER_NOT_EXPORTED)
        } else {
            registerReceiver(statusReceiver, filter)
        }

        // 서비스 상태 확인
        checkServiceStatus()
    }

    override fun onDestroy() {
        super.onDestroy()
        unregisterReceiver(statusReceiver)
    }

    private fun setupUI() {
        // 권한 요청 버튼
        binding.btnGrantPermissions.setOnClickListener {
            requestPermissions()
        }

        // 서비스 시작 버튼
        binding.btnStartService.setOnClickListener {
            if (checkPermissions()) {
                requestMediaProjection()
            } else {
                Toast.makeText(this, "먼저 권한을 허용해주세요", Toast.LENGTH_SHORT).show()
            }
        }

        // 서비스 중지 버튼
        binding.btnStopService.setOnClickListener {
            stopRecorderService()
        }

        // 버전 표시
        try {
            val pInfo = packageManager.getPackageInfo(packageName, 0)
            binding.tvVersion.text = "v${pInfo.versionName}"
        } catch (e: Exception) {
            binding.tvVersion.text = "v1.0.0"
        }
    }

    private fun getRequiredPermissions(): Array<String> {
        val permissions = mutableListOf<String>()

        // Android 13+ 알림 권한
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            permissions.add(Manifest.permission.POST_NOTIFICATIONS)
        }

        // 저장소 권한 (Android 버전별)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            permissions.add(Manifest.permission.READ_MEDIA_VIDEO)
            permissions.add(Manifest.permission.READ_MEDIA_IMAGES)
        } else if (Build.VERSION.SDK_INT <= Build.VERSION_CODES.P) {
            permissions.add(Manifest.permission.WRITE_EXTERNAL_STORAGE)
            permissions.add(Manifest.permission.READ_EXTERNAL_STORAGE)
        }

        return permissions.toTypedArray()
    }

    private fun checkPermissions(): Boolean {
        return getRequiredPermissions().all {
            ContextCompat.checkSelfPermission(this, it) == PackageManager.PERMISSION_GRANTED
        }
    }

    private fun requestPermissions() {
        val permissions = getRequiredPermissions()
        if (permissions.isNotEmpty()) {
            permissionLauncher.launch(permissions)
        }
    }

    private fun updatePermissionStatus() {
        val storageGranted = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            ContextCompat.checkSelfPermission(this, Manifest.permission.READ_MEDIA_VIDEO) == PackageManager.PERMISSION_GRANTED
        } else if (Build.VERSION.SDK_INT <= Build.VERSION_CODES.P) {
            ContextCompat.checkSelfPermission(this, Manifest.permission.WRITE_EXTERNAL_STORAGE) == PackageManager.PERMISSION_GRANTED
        } else {
            true // Android 10-12: Scoped Storage
        }

        val notificationGranted = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED
        } else {
            true
        }

        binding.tvPermStorage.text = "저장소: ${if (storageGranted) "✓" else "✗"}"
        binding.tvPermStorage.setTextColor(
            ContextCompat.getColor(this, if (storageGranted) R.color.success else R.color.error)
        )

        binding.tvPermNotification.text = "알림: ${if (notificationGranted) "✓" else "✗"}"
        binding.tvPermNotification.setTextColor(
            ContextCompat.getColor(this, if (notificationGranted) R.color.success else R.color.error)
        )

        // 모든 권한 허용 시 버튼 숨김
        if (storageGranted && notificationGranted) {
            binding.btnGrantPermissions.isEnabled = false
            binding.btnGrantPermissions.text = "권한 허용됨"
        }
    }

    private fun requestMediaProjection() {
        val intent = mediaProjectionManager.createScreenCaptureIntent()
        mediaProjectionLauncher.launch(intent)
    }

    private fun startRecorderService(resultCode: Int, data: Intent) {
        val serviceIntent = Intent(this, RecorderService::class.java).apply {
            action = RecorderService.ACTION_START
            putExtra(RecorderService.EXTRA_RESULT_CODE, resultCode)
            putExtra(RecorderService.EXTRA_DATA, data)
        }

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            startForegroundService(serviceIntent)
        } else {
            startService(serviceIntent)
        }

        updateStatus("준비 완료", "명령 대기 중...")
    }

    private fun stopRecorderService() {
        val serviceIntent = Intent(this, RecorderService::class.java).apply {
            action = RecorderService.ACTION_STOP
        }
        startService(serviceIntent)
        updateStatus("대기 중", "서비스가 중지되었습니다")
    }

    private fun checkServiceStatus() {
        // RecorderService가 실행 중인지 확인
        val intent = Intent(this, RecorderService::class.java).apply {
            action = RecorderService.ACTION_GET_STATUS
        }
        startService(intent)
    }

    private fun updateStatus(status: String, detail: String) {
        binding.tvStatus.text = status
        binding.tvStatusDetail.text = detail

        val color = when {
            status.contains("녹화") -> R.color.error
            status.contains("준비") || status.contains("완료") -> R.color.success
            status.contains("오류") -> R.color.error
            else -> R.color.text_primary
        }
        binding.tvStatus.setTextColor(ContextCompat.getColor(this, color))
    }

    companion object {
        const val ACTION_STATUS_UPDATE = "com.qaautomation.recorder.STATUS_UPDATE"
        const val EXTRA_STATUS = "status"
        const val EXTRA_DETAIL = "detail"
    }
}
