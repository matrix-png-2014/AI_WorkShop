/**
 * @file LLMService —— 商品问答 AI 服务客户端（预留真实 API 接口）
 * @description
 * 当前阶段使用内置模拟数据流（异步分块 + 打字机效果）；
 * 接入真实 LLM 服务时仅需在 {@link CONFIG.llm.endpoint} 配置端点，
 * 并替换本类的 _requestRemote 实现为 fetch(SSE/WebSocket)。
 */

import { CONFIG } from '../config.js';

/**
 * 模拟回复语料：按商品分类组织，未命中时使用通用话术。
 * @type {Object<string, string[]>}
 */
const MOCK_CORPUS = {
  default: [
    '这款商品采用模块化工艺设计，主体框架由轻质合金一体成型，表面经过三道阳极氧化处理，兼顾质感与耐用性。',
    '制作工艺上，它使用了 CNC 精密切削 + 手工打磨的组合流程，公差控制在 ±0.1mm；内部走线全部隐藏，外观干净利落。',
    '从材质看，主材选用环保级材料，符合 RoHS 标准；包装采用可回收瓦楞纸，运输破损率低于 0.5%。',
  ],
  '灯具': [
    '这款灯具的灯体采用旋压铝工艺一体成型，透光罩为高透光 PMMA 材质，经 UV 抗老化涂层处理，色温 3000K 暖白光，显色指数 Ra≥95。',
  ],
  '家具': [
    '家具主体采用北美白蜡木，榫卯结构 + 五金件双重固定；表面涂装为木蜡油，保留天然木纹，甲醛释放量符合 E0 级标准。',
  ],
  '数码': [
    '外壳为航空级铝合金 CNC 加工，内部主板经过三防涂覆；散热采用均热板 + 石墨烯方案，满载温升控制在 15°C 以内。',
  ],
};

/**
 * 问答上下文。
 * @typedef {Object} ChatContext
 * @property {string} productId 商品 ID
 * @property {string} productName 商品名称
 * @property {string} category 商品分类（用于语料匹配）
 */

/**
 * LLM 服务客户端（单例）。
 */
export class LLMService {
  /**
   * @returns {LLMService} 全局实例
   */
  static get instance() {
    if (!this._instance) this._instance = new LLMService();
    return this._instance;
  }

  /**
   * 发起一次流式问答。
   * @param {string} question 用户问题
   * @param {ChatContext} context 商品上下文
   * @param {Object} [opts]
   * @param {(chunk: string) => void} [opts.onChunk] 每个文本块回调（打字机数据源）
   * @param {AbortSignal} [opts.signal] 取消信号
   * @returns {Promise<string>} 完整回答
   */
  async ask(question, context, { onChunk, signal } = {}) {
    if (CONFIG.llm.endpoint) {
      // ---- 预留：真实 LLM 服务对接位 ----
      return this._requestRemote(question, context, { onChunk, signal });
    }
    return this._mockStream(question, context, { onChunk, signal });
  }

  /* ------------------------------------------------------------------ */
  /* 内部实现                                                            */
  /* ------------------------------------------------------------------ */

  /**
   * 模拟异步数据流：延迟 + 分块吐出语料。
   * @private
   */
  async _mockStream(question, context, { onChunk, signal }) {
    const [min, max] = CONFIG.llm.mockLatency;
    const latency = min + Math.random() * (max - min);

    await this._sleep(latency, signal);

    const corpus = MOCK_CORPUS[context.category] ?? MOCK_CORPUS.default;
    const answer = corpus[Math.floor(Math.random() * corpus.length)];
    const clean = `关于「${context.productName}」：${answer}`;

    // 以 4~12 字符为一组模拟流式返回
    const chunkSize = 4 + Math.floor(Math.random() * 8);
    let cursor = 0;
    let full = '';
    while (cursor < clean.length) {
      if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
      const chunk = clean.slice(cursor, cursor + chunkSize);
      full += chunk;
      onChunk?.(chunk);
      cursor += chunkSize;
      await this._sleep(CONFIG.llm.typeSpeedMs);
    }
    return full;
  }

  /**
   * 真实远端 LLM 接口占位：接入时在此实现 fetch 流式读取。
   * @private
   */
  async _requestRemote(question, context, { onChunk, signal }) {
    // TODO(接入点): fetch(CONFIG.llm.endpoint, { method:'POST', headers, body: JSON.stringify({question, context}), signal })
    // 然后逐块读取 ReadableStream 并调用 onChunk
    throw new Error('[LLMService] 真实端点尚未实现，请接入 fetch 流式逻辑');
  }

  /**
   * 可中断延时。
   * @param {number} ms
   * @param {AbortSignal} [signal]
   * @returns {Promise<void>}
   * @private
   */
  _sleep(ms, signal) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(resolve, ms);
      signal?.addEventListener('abort', () => {
        clearTimeout(timer);
        reject(new DOMException('Aborted', 'AbortError'));
      }, { once: true });
    });
  }
}
