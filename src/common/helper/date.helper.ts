import dayjs from 'dayjs';
/**
 * Date helper
 */
export class DateHelper {
  /**
   * Add days
   * @param value
   * @param unit
   * @returns
   */
  static add(value: number, unit: dayjs.ManipulateType) {
    return dayjs(value).add(30, unit);
  }

  // format date
  static format(date: number | string | Date) {
    const d = new Date(date);
    return d.toISOString();
  }
  static formatDate(date: number | string | Date) {
    const d = new Date(date);
    return d.toDateString();
  }

  static now() {
    const date = new Date();
    return date;
  }

  static nowString() {
    const date = new Date();
    return date.toISOString();
  }

  static nowDate() {
    const date = new Date();
    return date.toDateString();
  }

  static addDays(dateData, days: number) {
    days = Number(days);
    const date = new Date(dateData.valueOf());
    date.setDate(date.getDate() + days);
    return date.toDateString();
  }

  static addMonths(dateData, months: number) {
    months = Number(months);
    const date = new Date(dateData.valueOf());
    date.setMonth(date.getMonth() + months);
    return date.toDateString();
  }

  static addYears(dateData, years: number) {
    years = Number(years);
    const date = new Date(dateData.valueOf());
    date.setFullYear(date.getFullYear() + years);
    return date.toDateString();
  }

  static addHours(dateData, hours: number) {
    hours = Number(hours);
    const date = new Date(dateData.valueOf());
    date.setHours(date.getHours() + hours);
    return date.toDateString();
  }

  static addMinutes(dateData, minutes: number) {
    minutes = Number(minutes);
    const date = new Date(dateData.valueOf());
    date.setMinutes(date.getMinutes() + minutes);
    return date.toDateString();
  }

  static addSeconds(dateData, seconds: number) {
    seconds = Number(seconds);
    const date = new Date(dateData.valueOf());
    date.setSeconds(date.getSeconds() + seconds);
    return date.toDateString();
  }

  static diff(
    date1: string,
    date2: string,
    unit?: dayjs.QUnitType | dayjs.OpUnitType,
    float?: boolean,
  ) {
    const date1Data = dayjs(date1);
    const date2Data = dayjs(date2);

    return date2Data.diff(date1Data, unit, float);
  }

  /**
   * Calculate remaining time in days, hours, and minutes
   * @param dueDate - The due date
   * @param currentDate - Current date (optional, defaults to now)
   * @returns Object with days, hours, minutes, and formatted string
   */
  static getRemainingTime(dueDate: string | Date, currentDate?: string | Date) {
    const due = dayjs(dueDate);
    const now = currentDate ? dayjs(currentDate) : dayjs();

    const diff = due.diff(now);

    if (diff <= 0) {
      return {
        days: 0,
        hours: 0,
        minutes: 0,
        total: 0,
        formatted: 'Expired',
        isExpired: true
      };
    }

    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

    let formatted = '';
    if (days > 0) formatted += `${days}d `;
    if (hours > 0) formatted += `${hours}h `;
    if (minutes > 0) formatted += `${minutes}m`;
    if (!formatted) formatted = 'Less than 1 minute';  

    return {
      days,
      hours,
      minutes,
      total: diff,
      formatted: formatted.trim(),
      isExpired: false
    };
  }
}
