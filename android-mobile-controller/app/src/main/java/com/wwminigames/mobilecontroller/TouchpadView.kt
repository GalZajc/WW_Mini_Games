package com.wwminigames.mobilecontroller

import android.content.Context
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.util.AttributeSet
import android.view.MotionEvent
import android.view.View
import kotlin.math.max

class TouchpadView @JvmOverloads constructor(
    context: Context,
    attrs: AttributeSet? = null,
) : View(context, attrs) {

    data class TouchPoint(
        val id: Int,
        val x: Float,
        val y: Float,
        val nx: Float,
        val ny: Float,
        val force: Float,
    )

    data class TouchPayload(
        val eventType: String = "none",
        val touches: List<TouchPoint> = emptyList(),
        val changedTouches: List<TouchPoint> = emptyList(),
    )

    private val bgPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = Color.parseColor("#10233B")
    }

    private val borderPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = Color.parseColor("#2E5D89")
        style = Paint.Style.STROKE
        strokeWidth = resources.displayMetrics.density * 1.5f
    }

    private val dotPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = Color.parseColor("#80FFE0")
    }

    private val textPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = Color.parseColor("#EAF2FF")
        textAlign = Paint.Align.CENTER
        textSize = resources.displayMetrics.scaledDensity * 12f
    }

    private var activeTouches: List<TouchPoint> = emptyList()
    private var callback: ((TouchPayload) -> Unit)? = null

    fun setOnTouchPayload(callback: (TouchPayload) -> Unit) {
        this.callback = callback
    }

    override fun onDraw(canvas: Canvas) {
        super.onDraw(canvas)
        val radius = resources.displayMetrics.density * 18f
        canvas.drawRoundRect(0f, 0f, width.toFloat(), height.toFloat(), radius, radius, bgPaint)
        canvas.drawRoundRect(0f, 0f, width.toFloat(), height.toFloat(), radius, radius, borderPaint)

        activeTouches.forEachIndexed { index, touch ->
            canvas.drawCircle(touch.x, touch.y, max(18f, 26f * max(0.25f, touch.force)), dotPaint)
            canvas.drawText((index + 1).toString(), touch.x, touch.y + 5f, textPaint)
        }
    }

    override fun onTouchEvent(event: MotionEvent): Boolean {
        parent?.requestDisallowInterceptTouchEvent(true)

        val eventType = when (event.actionMasked) {
            MotionEvent.ACTION_DOWN, MotionEvent.ACTION_POINTER_DOWN -> "start"
            MotionEvent.ACTION_MOVE -> "move"
            MotionEvent.ACTION_UP, MotionEvent.ACTION_POINTER_UP -> "end"
            MotionEvent.ACTION_CANCEL -> "cancel"
            else -> "unknown"
        }

        val touches = buildList {
            for (i in 0 until event.pointerCount) {
                add(event.touchPointAt(i, width, height))
            }
        }

        val changedTouches = buildList {
            val idx = event.actionIndex
            if (idx in 0 until event.pointerCount) {
                add(event.touchPointAt(idx, width, height))
            }
        }

        activeTouches = if (eventType == "end" || eventType == "cancel") {
            if (event.pointerCount > 1 && eventType == "end") {
                touches.filterNot { it.id == event.getPointerId(event.actionIndex) }
            } else {
                emptyList()
            }
        } else {
            touches
        }

        callback?.invoke(
            TouchPayload(
                eventType = eventType,
                touches = touches,
                changedTouches = changedTouches,
            )
        )

        invalidate()
        return true
    }

    private fun MotionEvent.touchPointAt(index: Int, width: Int, height: Int): TouchPoint {
        val safeWidth = max(width, 1)
        val safeHeight = max(height, 1)
        return TouchPoint(
            id = getPointerId(index),
            x = getX(index),
            y = getY(index),
            nx = getX(index) / safeWidth,
            ny = getY(index) / safeHeight,
            force = getPressure(index),
        )
    }
}
