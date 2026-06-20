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
import { deleteMemory } from "./deleteMemory";
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
import { getAnthropicKeyStatus } from "./getAnthropicKeyStatus";
import { setAnthropicApiKey } from "./setAnthropicApiKey";
import { clearAnthropicApiKey } from "./clearAnthropicApiKey";
import { getBuckets } from "./getBuckets";
import { createBucket } from "./createBucket";
import { updateBucket } from "./updateBucket";
import { deleteBucket } from "./deleteBucket";
import { getCustomModels } from "./getCustomModels";
import { addCustomModel } from "./addCustomModel";
import { deleteCustomModel } from "./deleteCustomModel";
import { getMcpServers } from "./getMcpServers";
import { addMcpServer } from "./addMcpServer";
import { removeMcpServer } from "./removeMcpServer";
import { saveConversationToBucket } from "./saveConversationToBucket";
import { getSkills } from "./getSkills";
import { generateSkill } from "./generateSkill";
import { createSkill } from "./createSkill";
import { updateSkill } from "./updateSkill";
import { deleteSkill } from "./deleteSkill";
import { toggleSkill } from "./toggleSkill";

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
  deleteMemory,
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
  getAnthropicKeyStatus,
  setAnthropicApiKey,
  clearAnthropicApiKey,
  getBuckets,
  createBucket,
  updateBucket,
  deleteBucket,
  getCustomModels,
  addCustomModel,
  deleteCustomModel,
  getMcpServers,
  addMcpServer,
  removeMcpServer,
  saveConversationToBucket,
  getSkills,
  generateSkill,
  createSkill,
  updateSkill,
  deleteSkill,
  toggleSkill,
});
