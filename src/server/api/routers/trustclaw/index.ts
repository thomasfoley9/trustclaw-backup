import { router } from "~/server/api/trpc";
import { getInstance } from "./getInstance";
import { getStatus } from "./getStatus";
import { createInstance } from "./createInstance";
import { updateSettings } from "./updateSettings";
import { deleteInstance } from "./deleteInstance";
import { linkTelegram } from "./linkTelegram";
import { unlinkTelegram } from "./unlinkTelegram";
import { getCronJobs } from "./getCronJobs";
import { toggleCronJob } from "./toggleCronJob";
import { deleteCronJob } from "./deleteCronJob";
import { getHistory } from "./getHistory";
import { getStreamingMessage } from "./getStreamingMessage";
import { getMemories } from "./getMemories";
import { getPersonalities } from "./getPersonalities";
import { createPersonality } from "./createPersonality";
import { updatePersonality } from "./updatePersonality";
import { deletePersonality } from "./deletePersonality";
import { getConversations } from "./getConversations";
import { createConversation } from "./createConversation";
import { setActiveConversation } from "./setActiveConversation";
import { renameConversation } from "./renameConversation";
import { deleteConversation } from "./deleteConversation";
import { getIntegrationAuthLinks } from "./getIntegrationAuthLinks";
import { saveOnboardingState } from "./saveOnboardingState";
import { checkConnectionStatus } from "./checkConnectionStatus";
import { getComposioKeyStatus } from "./getComposioKeyStatus";
import { setComposioApiKey } from "./setComposioApiKey";
import { clearComposioApiKey } from "./clearComposioApiKey";
import { getBuckets } from "./getBuckets";
import { createBucket } from "./createBucket";
import { updateBucket } from "./updateBucket";
import { deleteBucket } from "./deleteBucket";
import { getCustomModels } from "./getCustomModels";
import { addCustomModel } from "./addCustomModel";
import { deleteCustomModel } from "./deleteCustomModel";

export const trustclawRouter = router({
  getInstance,
  getStatus,
  createInstance,
  updateSettings,
  deleteInstance,
  linkTelegram,
  unlinkTelegram,
  getCronJobs,
  toggleCronJob,
  deleteCronJob,
  getHistory,
  getStreamingMessage,
  getMemories,
  getPersonalities,
  createPersonality,
  updatePersonality,
  deletePersonality,
  getConversations,
  createConversation,
  setActiveConversation,
  renameConversation,
  deleteConversation,
  getIntegrationAuthLinks,
  saveOnboardingState,
  checkConnectionStatus,
  getComposioKeyStatus,
  setComposioApiKey,
  clearComposioApiKey,
  getBuckets,
  createBucket,
  updateBucket,
  deleteBucket,
  getCustomModels,
  addCustomModel,
  deleteCustomModel,
});
