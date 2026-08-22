/**
 * @file DeviceOrientationControls —— 设备陀螺仪相机控制（vendored）
 * @description
 * 自 three.js r163 起官方移除了 DeviceOrientationControls，
 * 本文件按 MIT 协议 vendor 其经典实现（基于 r162 官方源码重构），
 * 保持公共 API 完全一致：enabled / connect() / disconnect() / update() / dispose()。
 *
 * 增强点（相对官方 r162）：
 * - 使用 Screen Orientation API（screen.orientation.angle）进行横竖屏视角补偿，
 *   并回退 window.orientation；
 * - 对 alpha/beta/gamma 做空值防御；
 * - 增加 this.alphaOffset 可微调朝向零位。
 *
 * 许可：MIT License — Copyright © 2010-2024 three.js authors
 */

import { Euler, MathUtils, Quaternion, Vector3 } from 'three';

const _zee = new Vector3(0, 0, 1);
const _euler = new Euler();
const _q0 = new Quaternion();
const _q1 = new Quaternion(-Math.sqrt(0.5), 0, 0, Math.sqrt(0.5)); // -PI/2 around the x-axis

/**
 * 将设备姿态欧拉角（alpha/beta/gamma）叠加屏幕朝向角（orient）写入相机四元数。
 * @param {Quaternion} quaternion 目标四元数
 * @param {number} alpha 绕 z 轴（方位角，度）
 * @param {number} beta 绕 x 轴（俯仰角，度）
 * @param {number} gamma 绕 y 轴（翻滚角，度）
 * @param {number} orient 屏幕方向角（度，0/90/180/270）
 */
function setObjectQuaternion(quaternion, alpha, beta, gamma, orient) {
  _euler.set(beta, alpha, -gamma, 'YXZ');
  quaternion.setFromEuler(_euler);
  quaternion.multiply(_q1);
  quaternion.multiply(_q0.setFromAxisAngle(_zee, -orient));
}

/**
 * 陀螺仪相机控制。
 * @see https://github.com/mrdoob/three.js/blob/r162/examples/jsm/controls/DeviceOrientationControls.js
 */
export class DeviceOrientationControls {
  /**
   * @param {import('three').Camera} object 被控制的相机
   */
  constructor(object) {
    /** 被控制对象 */
    this.object = object;
    this.object.rotation.reorder('YXZ');

    /** 是否启用 */
    this.enabled = true;

    /** 最近一次 deviceorientation 事件数据 */
    this.deviceOrientation = null;

    /** 当前屏幕方向角（度） */
    this.screenOrientation = 0;

    /** 朝向零位微调（弧度） */
    this.alphaOffset = 0;

    const scope = this;

    /**
     * deviceorientation 事件处理：仅缓存原始数据，姿态计算在 update() 中进行。
     */
    const onDeviceOrientationChangeEvent = (event) => {
      scope.deviceOrientation = event;
    };

    /**
     * orientationchange 事件处理：读取屏幕方向角用于视角补偿。
     * 优先 Screen Orientation API，回退 window.orientation。
     */
    const onScreenOrientationChangeEvent = () => {
      if (window.screen?.orientation && typeof window.screen.orientation.angle === 'number') {
        scope.screenOrientation = window.screen.orientation.angle;
      } else {
        scope.screenOrientation = typeof window.orientation === 'number' ? window.orientation : 0;
      }
    };

    /**
     * 建立事件监听。
     */
    this.connect = () => {
      onScreenOrientationChangeEvent(); // 初始即读取一次方向角
      window.addEventListener('orientationchange', onScreenOrientationChangeEvent, false);
      window.addEventListener('deviceorientation', onDeviceOrientationChangeEvent, false);
    };

    /**
     * 移除事件监听（暂停传感器跟踪）。
     */
    this.disconnect = () => {
      window.removeEventListener('orientationchange', onScreenOrientationChangeEvent, false);
      window.removeEventListener('deviceorientation', onDeviceOrientationChangeEvent, false);
    };

    /**
     * 每帧更新：将设备姿态写入相机四元数（含屏幕方向补偿）。
     * 注意：
     * - 收到首个有效事件前保持相机姿态不变（避免零值把相机「钉」向默认朝向）
     * - 桌面端浏览器可能发射 alpha/beta/gamma 全为 null 的事件（无传感器），
     *   同样视为无效数据跳过，防止相机被错误旋转
     */
    this.update = () => {
      if (scope.enabled === false) return;
      const d = scope.deviceOrientation;
      if (d === null || d.alpha === null || d.beta === null || d.gamma === null) return;
      const { alpha = 0, beta = 0, gamma = 0 } = d;
      const alphaRad = MathUtils.degToRad(alpha);
      const betaRad = MathUtils.degToRad(beta);
      const gammaRad = MathUtils.degToRad(gamma);
      const orientRad = MathUtils.degToRad(scope.screenOrientation);
      setObjectQuaternion(scope.object.quaternion, alphaRad, betaRad, gammaRad, orientRad);
      if (scope.alphaOffset !== 0) {
        scope.object.quaternion.multiply(_q0.setFromAxisAngle(_zee, -scope.alphaOffset));
      }
    };

    /**
     * 释放资源。
     */
    this.dispose = () => {
      scope.disconnect();
      scope.enabled = false;
    };

    this.connect();
  }
}
