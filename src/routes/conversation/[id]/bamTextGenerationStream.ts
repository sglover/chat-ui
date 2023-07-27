import type { Options, BaseArgs, RequestArgs } from "@huggingface/inference";
import { getLines, getMessages } from "./vendor/fetch-event-source/parse";
import type { EventSourceMessage } from "./vendor/fetch-event-source/parse";


export type TextGenerationArgs = BaseArgs & {
	/**
	 * A string to be generated from
	 */
	inputs: string;
	watsonx_inference_api_url: string,
	watsonx_access_token: string,
	parameters?: {
		/**
		 * (Optional: True). Bool. Whether or not to use sampling, use greedy decoding otherwise.
		 */
		do_sample?: boolean;
		/**
		 * (Default: None). Int (0-250). The amount of new tokens to be generated, this does not include the input length it is a estimate of the size of generated text you want. Each new tokens slows down the request, so look for balance between response times and length of text generated.
		 */
		max_new_tokens?: number;
		/**
		 * (Default: None). Float (0-120.0). The amount of time in seconds that the query should take maximum. Network can cause some overhead so it will be a soft limit. Use that in combination with max_new_tokens for best results.
		 */
		max_time?: number;
		/**
		 * (Default: 1). Integer. The number of proposition you want to be returned.
		 */
		num_return_sequences?: number;
		/**
		 * (Default: None). Float (0.0-100.0). The more a token is used within generation the more it is penalized to not be picked in successive generation passes.
		 */
		repetition_penalty?: number;
		/**
		 * (Default: True). Bool. If set to False, the return results will not contain the original query making it easier for prompting.
		 */
		return_full_text?: boolean;
		/**
		 * (Default: 1.0). Float (0.0-100.0). The temperature of the sampling operation. 1 means regular sampling, 0 means always take the highest score, 100.0 is getting closer to uniform probability.
		 */
		temperature?: number;
		/**
		 * (Default: None). Integer to define the top tokens considered within the sample operation to create new text.
		 */
		top_k?: number;
		/**
		 * (Default: None). Float to define the tokens that are within the sample operation of text generation. Add tokens in the sample for more probable to least probable until the sum of the probabilities is greater than top_p.
		 */
		top_p?: number;
		/**
		 * (Default: None). Integer. The maximum number of tokens from the input.
		 */
		truncate?: number;

		stop_sequences?: string[];
		instruction?: string;
		examples?: {
			input: string,
			output: string
		}[];
	};
};

export interface TextGenerationStreamToken {
	/** Token ID from the model tokenizer */
	id: number;
	/** Token text */
	text: string;
	/** Logprob */
	logprob: number;
	/**
	 * Is the token a special token
	 * Can be used to ignore tokens when concatenating
	 */
	special: boolean;
}

export interface TextGenerationStreamPrefillToken {
	/** Token ID from the model tokenizer */
	id: number;
	/** Token text */
	text: string;
	/**
	 * Logprob
	 * Optional since the logprob of the first token cannot be computed
	 */
	logprob?: number;
}

export interface TextGenerationStreamBestOfSequence {
	/** Generated text */
	generated_text: string;
	/** Generation finish reason */
	finish_reason: TextGenerationStreamFinishReason;
	/** Number of generated tokens */
	generated_tokens: number;
	/** Sampling seed if sampling was activated */
	seed?: number;
	/** Prompt tokens */
	prefill: TextGenerationStreamPrefillToken[];
	/** Generated tokens */
	tokens: TextGenerationStreamToken[];
}

export type TextGenerationStreamFinishReason =
	/** number of generated tokens == `max_new_tokens` */
	| "length"
	/** the model generated its end of sequence token */
	| "eos_token"
	/** the model generated a text included in `stop_sequences` */
	| "stop_sequence";

export interface TextGenerationStreamDetails {
	/** Generation finish reason */
	finish_reason: TextGenerationStreamFinishReason;
	/** Number of generated tokens */
	generated_tokens: number;
	/** Sampling seed if sampling was activated */
	seed?: number;
	/** Prompt tokens */
	prefill: TextGenerationStreamPrefillToken[];
	/** */
	tokens: TextGenerationStreamToken[];
	/** Additional sequences when using the `best_of` parameter */
	best_of_sequences?: TextGenerationStreamBestOfSequence[];
}

export interface TextGenerationStreamResult {
	/**
	 * Complete generated text
	 * Only available when the generation is finished
	 */
	generated_text: string | null;
	generated_token_count: number | null;
}

export interface TextGenerationStreamOutput {
	model_id: string;
	results: TextGenerationStreamResult[];
}


/**
 * Loaded from huggingface.co/api/tasks if needed
 */
let tasks: Record<string, { models: { id: string }[] }> | null = null;

/**
 * Helper that prepares request arguments
 */
export async function makeRequestOptions(
	args: TextGenerationArgs & {
		data?: Blob | ArrayBuffer;
		stream?: boolean;
	},
	options?: Options & {
		/** For internal HF use, which is why it's not exposed in {@link Options} */
		includeCredentials?: boolean;
		/** When a model can be used for multiple tasks, and we want to run a non-default task */
		// forceTask?: string | InferenceTask;
		/** To load default model if needed */
		// taskHint?: InferenceTask;
	}
): Promise<{ url: string; info: RequestInit }> {
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	const { accessToken, model: _model, ...otherArgs } = args;
	console.log("args")
	console.log(args)
	let { model } = args;
	// const { forceTask: task, includeCredentials, taskHint, ...otherOptions } = options ?? {};

	const headers: Record<string, string> = {};
	if (accessToken) {
		headers["Authorization"] = `Bearer ${accessToken}`;
	}

	headers["Authorization"] = "Bearer " + args.watsonx_access_token;
	headers["Content-Type"] = "application/json";

	const url = (() => {
		return `${args.watsonx_inference_api_url}`;
	})();

	console.log("args.parameters")
	console.log(args.parameters)

	console.log("url=" + url + ".")

	const instruction = args.parameters?.instruction
	const examples = args.parameters?.examples

	console.log("instruction")
	console.log(instruction)

	console.log("examples")
	console.log(examples)

	const info: RequestInit = {
		headers,
		method: "POST",
		body: JSON.stringify({
			"model_id": model,
            "inputs": [args.inputs],
            "template" : {
				'id' : 'prompt_builder',
				'data' : {
					'instruction' : instruction,
					'input_prefix' : 'Input:',
					'output_prefix' : 'Output:',
					'examples' : examples
				}
			},
            "parameters" : {
				'decoding_method': 'sample',
				'min_new_tokens': 1,
				'max_new_tokens': 500,
				'beam_width': 1,
				"stop_sequences": args.parameters?.stop_sequences,
				"stream": args.stream,
				"temperature": 0,
				"top_k": 1,
				"top_p": 1
			}
		}),
		// credentials: includeCredentials ? "include" : "same-origin",
	};

	return { url, info };
}

/**
 * Primitive to make custom inference calls that expect server-sent events, and returns the response through a generator
 */
export async function* streamingRequest<T>(
	args: TextGenerationArgs,
	options?: Options & {
		/** For internal HF use, which is why it's not exposed in {@link Options} */
		includeCredentials?: boolean;
	}
): AsyncGenerator<T> {
	const { url, info } = await makeRequestOptions({ ...args, stream: true }, options);
	// console.log("url = " + url)
	// console.log("info=" + info)
	const response = await (options?.fetch ?? fetch)(url, info);

	if (options?.retry_on_error !== false && response.status === 503 && !options?.wait_for_model) {
		return streamingRequest(args, {
			...options,
			wait_for_model: true,
		});
	}
	if (!response.ok) {
		if (response.headers.get("Content-Type")?.startsWith("application/json")) {
			const output = await response.json();
			if (output.error) {
				throw new Error(output.error);
			}
		}

		throw new Error(`Server response contains error: ${response.status}`);
	}
	if (response.headers.get("content-type") !== "text/event-stream") {
		throw new Error(
			`Server does not support event stream content type, it returned ` + response.headers.get("content-type")
		);
	}

	if (!response.body) {
		return;
	}

	const reader = response.body.getReader();
	let events: EventSourceMessage[] = [];

	const onEvent = (event: EventSourceMessage) => {
		console.log("event=")
		console.log(event)
		// accumulate events in array
		events.push(event);
	};

	const onChunk = getLines(
		getMessages(
			() => {},
			() => {},
			onEvent
		)
	);

	try {
		while (true) {
			const { done, value } = await reader.read();
			console.log("value=")
			console.log(value)
			console.log("done=")
			console.log(done)
			if (done) return;
			const decoder = new TextDecoder();
			console.log("value1=")
			console.log(decoder.decode(value))
			onChunk(value);
			for (const event of events) {
				if (event.data.length > 0) {
					const data = JSON.parse(event.data);
					if (typeof data === "object" && data !== null && "error" in data) {
						throw new Error(data.error);
					}
					yield data as T;
				}
			}
			events = [];
		}
	} finally {
		reader.releaseLock();
	}
}


export async function* bamTextGenerationStream(
	args: TextGenerationArgs,
	options?: Options
): AsyncGenerator<TextGenerationStreamOutput> {
	yield* streamingRequest<TextGenerationStreamOutput>(args, options);
}




export type InferenceTask =
	| "audio-classification"
	| "audio-to-audio"
	| "automatic-speech-recognition"
	| "conversational"
	| "depth-estimation"
	| "document-question-answering"
	| "feature-extraction"
	| "fill-mask"
	| "image-classification"
	| "image-segmentation"
	| "image-to-image"
	| "image-to-text"
	| "object-detection"
	| "video-classification"
	| "question-answering"
	| "reinforcement-learning"
	| "sentence-similarity"
	| "summarization"
	| "table-question-answering"
	| "tabular-classification"
	| "tabular-regression"
	| "text-classification"
	| "text-generation"
	| "text-to-image"
	| "text-to-speech"
	| "text-to-video"
	| "token-classification"
	| "translation"
	| "unconditional-image-generation"
	| "visual-question-answering"
	| "zero-shot-classification"
	| "zero-shot-image-classification";

export interface TextGenerationOutput {
	/**
	 * The continuated string
	 */
	generated_text: string;
}

export interface BAMTextGenerationOutputEntry {
	/**
	 * The continuated string
	 */
	generated_text: string;
	generated_token_count: number;
	input_token_count: number;
	stop_reason: string;
	seed: number;
}

export interface BAMTextGenerationOutput {
	/**
	 * The continuated string
	 */
	// generated_text: string;
	results: BAMTextGenerationOutputEntry[]
}

export class InferenceOutputError extends TypeError {
	constructor(message: string) {
		super(
			`Invalid inference output: ${message}. Use the 'request' method with the same parameters to do a custom call with no type checking.`
		);
		this.name = "InferenceOutputError";
	}
}

/**
 * Primitive to make custom calls to the inference API
 */
export async function request<T>(
	args: TextGenerationArgs,
	options?: Options & {
		/** For internal HF use, which is why it's not exposed in {@link Options} */
		includeCredentials?: boolean;
		/** When a model can be used for multiple tasks, and we want to run a non-default task */
		task?: string | InferenceTask;
		/** To load default model if needed */
		taskHint?: InferenceTask;
	}
): Promise<T> {
	const { url, info } = await makeRequestOptions({ ...args, stream: false }, options);
	const response = await (options?.fetch ?? fetch)(url, info);

	if (options?.retry_on_error !== false && response.status === 503 && !options?.wait_for_model) {
		return request(args, {
			...options,
			wait_for_model: true,
		});
	}

	if (!response.ok) {
		if (response.headers.get("Content-Type")?.startsWith("application/json")) {
			const output = await response.json();
			if (output.error) {
				throw new Error(output.error);
			}
		}
		throw new Error("An error occurred while fetching the blob");
	}

	if (response.headers.get("Content-Type")?.startsWith("application/json")) {
		return await response.json();
	}

	return (await response.blob()) as T;
}

export async function textGeneration(args: TextGenerationArgs, options?: Options): Promise<TextGenerationOutput> {
	const res = await request<BAMTextGenerationOutput>(args, {
		...options,
		// taskHint: "text-generation",
	});
	return {
		"generated_text": res?.results[0].generated_text
	}
}


