import type { Options, BaseArgs, RequestArgs } from "@huggingface/inference";
import { getLines, getMessages } from "./vendor/fetch-event-source/parse";
import type { EventSourceMessage } from "./vendor/fetch-event-source/parse";


export type TextGenerationArgs = {
	/**
	 * A string to be generated from
	 */
	inputs: string;
	react_api_base_url: string;
	parameters?: {
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
	console.log("args" + args)

	const headers: Record<string, string> = {};
	headers["Content-Type"] = "application/json";

	const url = (() => {
		return `${args.react_api_base_url}`;
	})();

	console.log("args.parameters = " + args.parameters)
	console.log("url=" + url + ".")

	const info: RequestInit = {
		headers,
		method: "POST",
		body: JSON.stringify({
			input: args.inputs
		})
	};

	console.log("info=" + info)

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
	console.log("url = " + url)
	console.log("info")
	console.log(info)
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
	const contentType = response.headers.get("content-type");
	if (!contentType?.includes("text/event-stream")) {
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

	console.log("hello1")

	try {
		while (true) {
			const { done, value } = await reader.read();
			// console.log("value=" + value)
			// console.log("done=" + done)

			if (done) return;
			const decoder = new TextDecoder();
			// console.log("decoded value=" + decoder.decode(value))

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

export async function* reactTextGenerationStream(
	args: TextGenerationArgs,
	options?: Options
): AsyncGenerator<TextGenerationStreamOutput> {
	yield* streamingRequest<TextGenerationStreamOutput>(args, options);
}
