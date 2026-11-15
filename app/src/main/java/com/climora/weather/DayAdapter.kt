package com.climora.weather

import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.TextView
import androidx.recyclerview.widget.RecyclerView

class DayAdapter(private val days: List<DayForecast>) :
    RecyclerView.Adapter<DayAdapter.DayViewHolder>() {

    class DayViewHolder(view: View) : RecyclerView.ViewHolder(view) {
        val dayLabel: TextView = view.findViewById(R.id.day_label)
        val dayIcon: TextView = view.findViewById(R.id.day_icon)
        val dayDescription: TextView = view.findViewById(R.id.day_description)
        val dayTemps: TextView = view.findViewById(R.id.day_temps)
        val dayPrecip: TextView = view.findViewById(R.id.day_precip)
    }

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): DayViewHolder {
        val view = LayoutInflater.from(parent.context)
            .inflate(R.layout.item_forecast, parent, false)
        return DayViewHolder(view)
    }

    override fun onBindViewHolder(holder: DayViewHolder, position: Int) {
        val day = days[position]
        holder.dayLabel.text = day.dayLabel
        holder.dayIcon.text = day.icon
        holder.dayDescription.text = day.description
        holder.dayTemps.text = holder.itemView.context.getString(
            R.string.day_temps, day.tempMax.toInt(), day.tempMin.toInt()
        )
        holder.dayPrecip.text = holder.itemView.context.getString(
            R.string.day_precip, day.precipitationProbability
        )
    }

    override fun getItemCount(): Int = days.size
}
